// ==========================================================================
// 1. CONFIGURAÇÃO DO SUPABASE E SESSÃO DO UTILIZADOR
// ==========================================================================
const SUPABASE_URL = "https://bztpwtrvcidhoesunjrl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_q4ttpTsNleNbTiZlZlUaEA_kOgqsXnF";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let postAtivoId = null;     // Guarda o ID do post ativo para ações (Desktop/Mobile)
let usuarioLogadoId = null;  // Guarda o UUID do usuário autenticado

/**
 * Atualiza dinamicamente o contador de registros na tela (Seção Perfil)
 */
async function atualizarContadorGeral() {
    if (!usuarioLogadoId) return;
    
    try {
        const { count, error } = await supabaseClient
            .from('posts')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', usuarioLogadoId);

        if (error) throw error;

        const contadorElemento = document.querySelector('.counter-number');
        if (contadorElemento) {
            contadorElemento.textContent = count ?? 0;
        }
    } catch (err) {
        console.error("Erro ao atualizar contador de registros:", err.message);
    }
}

/**
 * Verifica se há um usuário ativo, gerencia o redirecionamento de segurança
 * e carrega todos os dados do perfil (Username, Avatar e Bio).
 */
async function verificarUsuarioAtivo() {
    try {
        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
        
        // Se não houver sessão activa, expulsa para a página de login
        if (sessionError || !session) {
            console.log("Nenhuma sessão activa encontrada. Redirecionando para login.html");
            window.location.href = "login.html";
            return;
        }

        usuarioLogadoId = session.user.id;
        console.log("Usuário autenticado com ID:", usuarioLogadoId);

        // Busca consolidada de todos os dados do perfil na tabela 'perfis'
        const { data: perfil, error: perfilError } = await supabaseClient
            .from('perfis')
            .select('username, avatar_url, bio')
            .eq('id', usuarioLogadoId)
            .maybeSingle();

        // 1. Gerencia a exibição do Nome de Usuário
        const txtUsername = document.getElementById("nav-username");
        if (perfil && perfil.username) {
            if (txtUsername) txtUsername.innerText = perfil.username;
        } else {
            if (txtUsername) txtUsername.innerText = session.user.email.split('@')[0];
            console.warn("Perfil não encontrado na tabela 'perfis', aplicando fallback do e-mail.");
        }

        // 2. Gerencia a exibição e os estados dinâmicos do Avatar (Lixeira vs Lápis)
        const avatarContent = document.getElementById("avatar-content");
        const btnAvatarAction = document.getElementById("btn-avatar-action");

        if (perfil && perfil.avatar_url) {
            if (avatarContent) {
                avatarContent.innerHTML = `<img src="${perfil.avatar_url}" alt="Foto de Perfil">`;
            }
            if (btnAvatarAction) {
                btnAvatarAction.innerHTML = `<i class="fa-regular fa-trash-can"></i>`;
                btnAvatarAction.classList.add("delete-mode");
                btnAvatarAction.title = "Excluir foto de perfil";
            }
        } else {
            if (avatarContent) {
                avatarContent.innerHTML = `<i class="fa-solid fa-user"></i>`;
            }
            if (btnAvatarAction) {
                btnAvatarAction.innerHTML = `<i class="fa-solid fa-pencil"></i>`;
                btnAvatarAction.classList.remove("delete-mode");
                btnAvatarAction.title = "Adicionar foto de perfil";
            }
        }

        // 3. Gerencia a exibição do texto da Bio (Seção Hero)
        if (perfil && perfil.bio) {
            const paragrafoHero = document.getElementById("paragrafoPost");
            if (paragrafoHero) {
                paragrafoHero.innerText = perfil.bio;
            }
        }

        // Carrega e renderiza os posts privados do usuário e atualiza o contador principal
        await carregarPosts();
        atualizarContadorGeral();

    } catch (globalError) {
        console.error("Erro crítico na verificação do usuário:", globalError);
        if (!window.location.pathname.includes("login.html") && !window.location.pathname.includes("cadastro.html")) {
            window.location.href = "login.html";
        }
    }
}

// Inicializa a verificação assim que o DOM estiver pronto (exceto em páginas de auth)
document.addEventListener("DOMContentLoaded", () => {
    if (!window.location.pathname.includes("login.html") && !window.location.pathname.includes("cadastro.html")) {
        verificarUsuarioAtivo();
    }
});


// ==========================================================================
// 2. GESTÃO DO FEED PRINCIPAL (POSTS PRIVADOS)
// ==========================================================================

/**
 * Cria a estrutura HTML de um post e o insere no topo da galeria do feed.
 */
function renderCard(post) {
    const gallery = document.querySelector(".gallery");
    if (!gallery) return;
    
    // Evita duplicidade de cards clonados na tela
    if (document.querySelector(`[data-id="${post.id}"]`)) return;

    // Remove mensagem de "Nenhum momento registrado" caso ela exista
    const mensagemVazio = gallery.querySelector(".sem-registros");
    if (mensagemVazio) mensagemVazio.remove();

    const card = document.createElement("div");
    card.className = "card card-post";
    card.dataset.id = post.id;

    card.innerHTML = `
        <div class="card-options-container">
            <button class="btn-options"><i class="fa-solid fa-ellipsis"></i></button>
            <div class="options-menu">
                <button class="menu-item btn-add-gallery-desktop" data-id="${post.id}"><i class="fa-regular fa-images"></i> Adicionar à galeria</button>
                <button class="menu-item btn-edit-caption-desktop" data-id="${post.id}"><i class="fa-regular fa-pen-to-square"></i> Editar legenda</button>
                <button class="menu-item btn-delete-post-desktop delete-option" data-id="${post.id}"><i class="fa-regular fa-trash-can"></i> Apagar registro</button>
            </div>
        </div>
        <div class="card-image-wrapper">
            <img src="${post.image_url}" alt="Imagem do post">
        </div>
    `;

    const btnOptions = card.querySelector(".btn-options");
    const optionsMenu = card.querySelector(".options-menu");

    // Evento para abrir o menu de opções (Dropdown no desktop / Bottom Sheet no mobile)
    btnOptions.addEventListener("click", (e) => {
        e.stopPropagation();
        postAtivoId = post.id;

        if (window.innerWidth <= 768) {
            document.getElementById("optionsModal")?.classList.add("active");
            document.body.style.overflow = "hidden";
        } else {
            document.querySelectorAll(".options-menu.active").forEach(m => {
                if (m !== optionsMenu) m.classList.remove("active");
            });
            optionsMenu.classList.toggle("active");
        }
    });

    // Eventos disparados via menu Desktop
    card.querySelector(".btn-delete-post-desktop").addEventListener("click", (e) => {
        e.stopPropagation();
        optionsMenu.classList.remove("active");
        
        // Abre o modal customizado em vez do confirm nativo
        const deletePostModal = document.getElementById("deletePostModal");
        if (deletePostModal) {
            deletePostModal.classList.add("active");
            document.body.style.overflow = "hidden";
        }
    });

    card.querySelector(".btn-add-gallery-desktop").addEventListener("click", (e) => {
        e.stopPropagation();
        optionsMenu.classList.remove("active");
        adicionarPostAGaleria(post.id);
    });

    // Insere sempre no topo da galeria (o mais recente primeiro)
    gallery.insertBefore(card, gallery.firstChild);
}

/**
 * Busca APENAS os posts pertencentes ao usuário autenticado.
 */
async function carregarPosts() {
    try {
        const { data: posts, error } = await supabaseClient
            .from('posts')
            .select('*')
            .eq('user_id', usuarioLogadoId) // FILTRO ESSENCIAL: Garante feed individual
            .order('created_at', { ascending: true });

        if (error) throw error;

        const gallery = document.querySelector(".gallery");
        if (!gallery) return;

        if (!posts || posts.length === 0) {
            gallery.innerHTML = `
                <div class="sem-registros">
                    <i class="fa-regular fa-image"></i>
                    <p>Nenhum momento registrado ainda.</p>
                </div>
            `;
            return;
        }

        gallery.innerHTML = "";
        posts.forEach(post => renderCard(post));

    } catch (error) {
        console.error("Erro ao carregar os posts:", error.message);
    }
}

/**
 * Apaga permanentemente um post do banco de dados e limpa o card do DOM.
 */
async function executarExclusaoPost(id) {
    if (!id) return;

    try {
        const { error } = await supabaseClient
            .from('posts')
            .delete()
            .eq('id', id);

        if (error) throw error;

        document.querySelector(`[data-id="${id}"]`)?.remove();

        const gallery = document.querySelector(".gallery");
        if (gallery && gallery.children.length === 0) {
            gallery.innerHTML = `
                <div class="sem-registros">
                    <i class="fa-regular fa-image"></i>
                    <p>Nenhum momento registrado ainda.</p>
                </div>
            `;
        }

        if (postAtivoId === id) postAtivoId = null;

        // Atualiza a contagem após remover o registro
        atualizarContadorGeral();

    } catch (error) {
        alert("Erro ao excluir: " + error.message);
    }
}


// ==========================================================================
// 3. OPERAÇÕES E RENDERIZAÇÃO DA GALERIA DE RECORDAÇÕES
// ==========================================================================

/**
 * Salva a referência de um post na tabela customizada 'galeria' do usuário.
 */
async function adicionarPostAGaleria(id) {
    if (!id || !usuarioLogadoId) return;

    try {
        const { data: existente, error: erroVerificacao } = await supabaseClient
            .from('galeria')
            .select('id')
            .eq('user_id', usuarioLogadoId)
            .eq('post_id', id)
            .maybeSingle();

        if (erroVerificacao) throw erroVerificacao;

        if (existente) {
            alert("Este registro já se encontra na sua galeria!");
            return;
        }

        const { error } = await supabaseClient
            .from('galeria')
            .insert([
                {
                    user_id: usuarioLogadoId,
                    post_id: id,
                    created_at: new Date().toISOString()
                }
            ]);

        if (error) throw error;


    } catch (error) {
        alert("Erro ao adicionar à galeria: " + error.message);
        console.error(error);
    }
}

/**
 * Carrega e exibe de forma assíncrona todas as recordações salvas pelo usuário logado.
 */
async function carregarMinhaGaleria() {
    const gridGaleria = document.querySelector(".album-photos-grid");
    const contadorGaleria = document.querySelector(".galeria-contador");
    if (!gridGaleria) return;

    try {
        gridGaleria.innerHTML = "<p style='grid-column: 1/-1; text-align:center;'>Carregando galeria...</p>";

        const { data: itensGaleria, error } = await supabaseClient
            .from('galeria')
            .select(`
                id,
                post_id,
                posts (
                    image_url,
                    caption
                )
            `)
            .eq('user_id', usuarioLogadoId);

        if (error) throw error;

        if (contadorGaleria) {
            contadorGaleria.innerText = `${itensGaleria.length} momentos salvos`;
        }

        if (!itensGaleria || itensGaleria.length === 0) {
            gridGaleria.innerHTML = `
                <div class="sem-registros" style="grid-column: 1 / -1;">
                    <i class="fa-regular fa-images"></i>
                    <p>Sua galeria está vazia.</p>
                </div>
            `;
            return;
        }

        gridGaleria.innerHTML = "";

        itensGaleria.forEach(item => {
            if (!item.posts) return; 

            const wrapper = document.createElement("div");
            wrapper.className = "album-photo-wrapper";
            wrapper.dataset.galeriaId = item.id;

            wrapper.innerHTML = `
                <button class="btn-delete-galeria" title="Remover da Galeria"><i class="fa-solid fa-trash-can"></i></button>
                <img src="${item.posts.image_url}" alt="${item.posts.caption || 'Foto da galeria'}">
            `;

            // Remoção de itens diretamente da galeria
            wrapper.querySelector(".btn-delete-galeria").addEventListener("click", async (e) => {
                e.stopPropagation();
                if (!confirm("Remover esta foto da sua galeria de recordações?")) return;

                try {
                    const { error: deleteError } = await supabaseClient
                        .from('galeria')
                        .delete()
                        .eq('id', item.id);

                    if (deleteError) throw deleteError;

                    wrapper.remove();
                    
                    const novosItens = document.querySelectorAll(".album-photo-wrapper");
                    if (contadorGaleria) contadorGaleria.innerText = `${novosItens.length} momentos salvos`;
                    
                    if (novosItens.length === 0) {
                        gridGaleria.innerHTML = `
                            <div class="sem-registros" style="grid-column: 1 / -1;">
                                <i class="fa-regular fa-images"></i>
                                <p>Sua galeria de recordações está vazia.</p>
                            </div>
                        `;
                    }
                } catch (err) {
                    alert("Erro ao remover item: " + err.message);
                }
            });

            gridGaleria.appendChild(wrapper);
        });

    } catch (error) {
        console.error("Erro ao carregar itens da galeria:", error.message);
        gridGaleria.innerHTML = "<p style='grid-column: 1/-1; text-align:center; color: red;'>Erro ao carregar recordações.</p>";
    }
}


// ==========================================================================
// 4. EVENTOS DE INTERFACE, MODAIS E UPLOADS (DOM)
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
    // Captura de referências globais de elementos da interface
    const menuToggle = document.getElementById("menu-toggle");
    const menuClose = document.getElementById("menu-close");
    const navMenu = document.getElementById("nav-menu");
    
    const logoutModal = document.getElementById("logoutModal");
    const optionsModal = document.getElementById("optionsModal");
    const publicarModal = document.getElementById("publicarModal");
    const galeriaModal = document.getElementById("galeriaModal"); 
    const deleteAvatarModal = document.getElementById("deleteAvatarModal");
    const deletePostModal = document.getElementById("deletePostModal"); // Novo modal de post
    
    const btnLogout = document.getElementById("nav-logout"); 
    const btnCancelLogout = document.getElementById("btnCancelLogout");
    const btnConfirmLogout = document.getElementById("btnConfirmLogout");
    const btnCancelSheet = document.getElementById("btnCancelSheet");
    
    const btnCancelDeleteAvatar = document.getElementById("btnCancelDeleteAvatar");
    const btnConfirmDeleteAvatar = document.getElementById("btnConfirmDeleteAvatar");

    const btnCancelDeletePost = document.getElementById("btnCancelDeletePost");
    const btnConfirmDeletePost = document.getElementById("btnConfirmDeletePost");

    const btnDeletePostMobile = document.querySelector(".btn-delete-post-mobile");
    const btnAddGalleryMobile = document.querySelector(".btn-add-gallery-mobile");

    const menuLinkGaleria = document.getElementById("menu-link-galeria");
    const btnFecharGaleria = document.getElementById("btnFecharGaleria"); 

    const btnAbrirPublicar = document.getElementById("btn-abrir-publicar");
    const btnCancelarPublicar = document.getElementById("btnCancelarPublicar");
    const formPublicar = document.getElementById("form-publicar");

    // --- LÓGICA DE EXCLUSÃO / ADIÇÃO FLUTUANTE DO AVATAR ---
    const btnAvatarAction = document.getElementById("btn-avatar-action");
    const avatarUploadInput = document.getElementById("avatar-upload-input");
    const avatarContent = document.getElementById("avatar-content");

    if (btnAvatarAction && avatarUploadInput) {
        btnAvatarAction.addEventListener("click", () => {
            if (btnAvatarAction.classList.contains("delete-mode")) {
                if (deleteAvatarModal) {
                    deleteAvatarModal.classList.add("active");
                    document.body.style.overflow = "hidden";
                }
            } else {
                avatarUploadInput.click();
            }
        });

        avatarUploadInput.addEventListener("change", async () => {
            if (!avatarUploadInput.files || avatarUploadInput.files.length === 0) return;

            const file = avatarUploadInput.files[0];
            const reader = new FileReader();

            reader.readAsDataURL(file);
            reader.onload = async () => {
                const base64Avatar = reader.result;

                try {
                    if (avatarContent) avatarContent.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;

                    const { error } = await supabaseClient
                        .from('perfis')
                        .update({ avatar_url: base64Avatar })
                        .eq('id', usuarioLogadoId);

                    if (error) throw error;

                    verificarUsuarioAtivo();

                } catch (err) {
                    alert("Erro ao salvar foto de perfil: " + err.message);
                    if (avatarContent) avatarContent.innerHTML = `<i class="fa-solid fa-user"></i>`;
                }
            };
        });
    }

    if (btnCancelDeleteAvatar && deleteAvatarModal) {
        btnCancelDeleteAvatar.addEventListener("click", () => {
            deleteAvatarModal.classList.remove("active");
            document.body.style.overflow = "";
        });
    }

    if (btnConfirmDeleteAvatar && deleteAvatarModal) {
        btnConfirmDeleteAvatar.addEventListener("click", async () => {
            if (!usuarioLogadoId) return;

            try {
                const { error } = await supabaseClient
                    .from('perfis')
                    .update({ avatar_url: null })
                    .eq('id', usuarioLogadoId);

                if (error) throw error;

                deleteAvatarModal.classList.remove("active");
                document.body.style.overflow = "";
                verificarUsuarioAtivo();

            } catch (err) {
                alert("Erro ao excluir foto de perfil: " + err.message);
            }
        });
    }

    // --- CONTROLE DE EXCLUSÃO CUSTOMIZADA DO POST (IGUAL AO AVATAR) ---
    if (btnCancelDeletePost && deletePostModal) {
        btnCancelDeletePost.addEventListener("click", () => {
            deletePostModal.classList.remove("active");
            document.body.style.overflow = "";
        });
    }

    if (btnConfirmDeletePost && deletePostModal) {
        btnConfirmDeletePost.addEventListener("click", async () => {
            if (postAtivoId) {
                await executarExclusaoPost(postAtivoId);
                deletePostModal.classList.remove("active");
                document.body.style.overflow = "";
            }
        });
    }

    // --- LÓGICA DE CLIQUE DIRETO NA GALERIA (TRUQUE DO BOTÃO PERSONALIZADO) ---
    const inputImagemReal = document.getElementById("input-imagem");
    const btnFalsoUpload = document.getElementById("btn-falso-upload");
    const txtNomeArquivo = document.getElementById("nome-arquivo-selecionado");

    if (btnFalsoUpload && inputImagemReal) {
        btnFalsoUpload.addEventListener("click", () => {
            inputImagemReal.click();
        });

        inputImagemReal.addEventListener("change", () => {
            if (inputImagemReal.files && inputImagemReal.files.length > 0) {
                const nomeDoArquivo = inputImagemReal.files[0].name;
                
                if (txtNomeArquivo) {
                    txtNomeArquivo.innerText = `✓ Foto selecionada: ${nomeDoArquivo}`;
                    txtNomeArquivo.style.display = "block";
                }
                btnFalsoUpload.style.borderColor = "#28a745";
                btnFalsoUpload.style.background = "#f4fbf6";
            } else {
                if (txtNomeArquivo) txtNomeArquivo.style.display = "none";
                btnFalsoUpload.style.borderColor = "#ddd";
                btnFalsoUpload.style.background = "#fafafa";
            }
        });
    }

    // --- COMPORTAMENTO DO MENU MOBILE (BOTTOM SHEET) ---
    if (btnDeletePostMobile) {
        btnDeletePostMobile.addEventListener("click", () => {
            if (postAtivoId) {
                optionsModal.classList.remove("active");
                // Em vez de deletar direto, abre o modal customizado de confirmação
                if (deletePostModal) {
                    deletePostModal.classList.add("active");
                }
            }
        });
    }

    if (btnAddGalleryMobile) {
        btnAddGalleryMobile.addEventListener("click", () => {
            if (postAtivoId) {
                optionsModal.classList.remove("active");
                document.body.style.overflow = "";
                adicionarPostAGaleria(postAtivoId);
            }
        });
    }

    // --- CONTROLE DE EXIBIÇÃO DO MODAL DA GALERIA ---
    if (menuLinkGaleria && galeriaModal) {
        menuLinkGaleria.addEventListener("click", (e) => {
            e.preventDefault();
            if (navMenu) navMenu.classList.remove("active"); 
            galeriaModal.classList.add("active");
            document.body.style.overflow = "hidden";
            carregarMinhaGaleria(); 
        });
    }

    if (btnFecharGaleria && galeriaModal) {
        btnFecharGaleria.addEventListener("click", () => {
            galeriaModal.classList.remove("active");
            document.body.style.overflow = "";
        });
    }

    // --- CONTROLE DO FORMULÁRIO DE PUBLICAÇÃO DE NOVO POST ---
    if (btnAbrirPublicar && publicarModal) {
        btnAbrirPublicar.addEventListener("click", () => {
            publicarModal.classList.add("active");
            document.body.style.overflow = "hidden";
        });
    }

    if (btnCancelarPublicar && publicarModal) {
        btnCancelarPublicar.addEventListener("click", () => {
            publicarModal.classList.remove("active");
            formPublicar.reset();
            document.body.style.overflow = "";
            
            if (txtNomeArquivo) txtNomeArquivo.style.display = "none";
            if (btnFalsoUpload) {
                btnFalsoUpload.style.borderColor = "#ddd";
                btnFalsoUpload.style.background = "#fafafa";
            }
        });
    }

    if (formPublicar) {
        formPublicar.addEventListener("submit", async (e) => {
            e.preventDefault();
            const btnEnviar = document.getElementById("btnEnviarPost");
            const inputImagem = document.getElementById("input-imagem");

            if (!inputImagem.files || inputImagem.files.length === 0) {
                alert("Por favor, selecione uma imagem.");
                return;
            }

            const file = inputImagem.files[0];
            const reader = new FileReader();
            
            reader.readAsDataURL(file);
            reader.onload = async () => {
                const base64Image = reader.result;

                try {
                    btnEnviar.innerText = "Registrando..";
                    btnEnviar.disabled = true;

                    const { data, error } = await supabaseClient
                        .from('posts')
                        .insert([
                            {
                                user_id: usuarioLogadoId,
                                image_url: base64Image,
                                caption: null, 
                                created_at: new Date().toISOString()
                            }
                        ])
                        .select();

                    if (error) throw error;

                    if (data && data.length > 0) {
                        renderCard(data[0]);
                    }

                    publicarModal.classList.remove("active");
                    formPublicar.reset();
                    document.body.style.overflow = "";

                    if (txtNomeArquivo) txtNomeArquivo.style.display = "none";
                    if (btnFalsoUpload) {
                        btnFalsoUpload.style.borderColor = "#ddd";
                        btnFalsoUpload.style.background = "#fafafa";
                    }

                    atualizarContadorGeral();

                } catch (err) {
                    alert("Erro ao publicar: " + err.message);
                    console.error(err);
                } finally {
                    btnEnviar.innerText = "Registrar";
                    btnEnviar.disabled = false;
                }
            };
        });
    }

    // --- MENU LATERAL (NAV-MENU) E LOGOUT ---
    if (menuToggle && navMenu) menuToggle.addEventListener("click", () => navMenu.classList.add("active"));
    if (menuClose && navMenu) menuClose.addEventListener("click", () => navMenu.classList.remove("active"));

    if (btnLogout && logoutModal) {
        btnLogout.addEventListener("click", (e) => {
            e.preventDefault();
            if (navMenu) navMenu.classList.remove("active");
            logoutModal.classList.add("active");
            document.body.style.overflow = "hidden";
        });
    }

    if (btnCancelLogout && logoutModal) {
        btnCancelLogout.addEventListener("click", () => {
            logoutModal.classList.remove("active");
            document.body.style.overflow = "";
        });
    }

    if (btnConfirmLogout) {
        btnConfirmLogout.addEventListener("click", async () => {
            try {
                await supabaseClient.auth.signOut();
                window.location.href = "login.html";
            } catch (err) {
                alert("Erro ao deslogar: " + err.message);
            }
        });
    }

    if (btnCancelSheet && optionsModal) {
        btnCancelSheet.addEventListener("click", () => {
            optionsModal.classList.remove("active");
            document.body.style.overflow = "";
        });
    }

    // --- FECHAMENTO DE MODAIS ATRAVÉS DE CLIQUE NO OVERLAY OUTSIDE ---
    document.addEventListener("click", (e) => {
        if (e.target === logoutModal || e.target === optionsModal || e.target === publicarModal || e.target === galeriaModal || e.target === deleteAvatarModal || e.target === deletePostModal) {
            logoutModal?.classList.remove("active");
            optionsModal?.classList.remove("active");
            publicarModal?.classList.remove("active");
            galeriaModal?.classList.remove("active");
            deleteAvatarModal?.classList.remove("active");
            deletePostModal?.classList.remove("active");
            document.body.style.overflow = "";
        }
    });

    document.addEventListener("click", (e) => {
        if (navMenu && navMenu.classList.contains("active")) {
            if (!navMenu.contains(e.target) && !menuToggle.contains(e.target)) {
                navMenu.classList.remove("active");
            }
        }
    });
});