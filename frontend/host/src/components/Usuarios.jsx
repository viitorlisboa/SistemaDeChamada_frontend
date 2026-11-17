import { useCallback, useEffect, useState } from 'react'
import { fetchWithAuth, getJson, lerErro } from '../api/fetchWithAuth.js'
import './Usuarios.css'

// Cadastro de usuários (somente ADMIN).
// ALUNO     -> cria o aluno no aluno-service e o login vinculado a ele
// PROFESSOR -> cria o professor no turma-service e o login vinculado a ele
// ADMIN     -> cria só o login
// Se a criação do login falhar, o aluno/professor recém-criado é removido (nada fica pela metade).
const USUARIOS_API = '/api/auth/usuarios'
const ALUNOS_API = '/api/alunos'
const PROFESSORES_API = '/api/professores'

const FORM_INICIAL = { role: 'ALUNO', nome: '', email: '', matricula: '', username: '', password: '' }

const PERFIS = [
  { valor: 'ALUNO', rotulo: 'Aluno', descricao: 'Vê só os próprios dados e a frequência.' },
  { valor: 'PROFESSOR', rotulo: 'Professor', descricao: 'Faz as chamadas e vê os alunos das suas turmas.' },
  { valor: 'ADMIN', rotulo: 'Administrador', descricao: 'Acesso total, inclusive a esta aba.' },
]

const ROTULO_PERFIL = { ALUNO: 'Aluno', PROFESSOR: 'Professor', ADMIN: 'Administrador' }

/** Cria o registro de aluno/professor e devolve { id, desfazer } (desfazer = apagar o registro criado). */
async function criarCadastroVinculado(form) {
  if (form.role === 'ADMIN') {
    return { id: null, desfazer: async () => {} }
  }
  const ehAluno = form.role === 'ALUNO'
  const api = ehAluno ? ALUNOS_API : PROFESSORES_API
  const corpo = ehAluno
    ? { nome: form.nome.trim(), matricula: form.matricula.trim(), email: form.email.trim() }
    : { nome: form.nome.trim(), email: form.email.trim() }

  const resposta = await fetchWithAuth(api, { method: 'POST', body: JSON.stringify(corpo) })
  if (!resposta.ok) {
    throw new Error(await lerErro(resposta, `Não foi possível cadastrar o ${ehAluno ? 'aluno' : 'professor'}.`))
  }
  const criado = await resposta.json()
  return {
    id: criado.id,
    desfazer: async () => {
      await fetchWithAuth(`${api}/${criado.id}`, { method: 'DELETE' }).catch(() => {})
    },
  }
}

function Usuarios() {
  const [usuarios, setUsuarios] = useState([])
  const [alunos, setAlunos] = useState([])
  const [professores, setProfessores] = useState([])
  const [form, setForm] = useState(FORM_INICIAL)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const [listaUsuarios, listaAlunos, listaProfessores] = await Promise.all([
        getJson(USUARIOS_API, 'Não foi possível carregar os usuários.'),
        getJson(ALUNOS_API, 'Não foi possível carregar os alunos.'),
        getJson(PROFESSORES_API, 'Não foi possível carregar os professores.'),
      ])
      setUsuarios(listaUsuarios)
      setAlunos(listaAlunos)
      setProfessores(listaProfessores)
    } catch (e) {
      setErro(e.message)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  function alterarCampo(evento) {
    const { name, value } = evento.target
    setForm((atual) => ({ ...atual, [name]: value }))
  }

  function escolherPerfil(role) {
    setErro('')
    setMensagem('')
    setForm((atual) => ({ ...atual, role }))
  }

  async function criar(evento) {
    evento.preventDefault()
    setErro('')
    setMensagem('')

    const username = form.username.trim().toLowerCase()
    if (usuarios.some((u) => u.username?.toLowerCase() === username)) {
      setErro(`Já existe um usuário com o login "${username}".`)
      return
    }

    setSalvando(true)
    let cadastro = null
    try {
      // 1. Cadastro do aluno/professor (ADMIN não tem)
      cadastro = await criarCadastroVinculado(form)

      // 2. Login vinculado ao cadastro
      const resposta = await fetchWithAuth(USUARIOS_API, {
        method: 'POST',
        body: JSON.stringify({
          username,
          password: form.password,
          role: form.role,
          referenciaId: cadastro.id,
        }),
      })
      if (!resposta.ok) {
        const motivo = await lerErro(resposta, 'Não foi possível criar o login.')
        await cadastro.desfazer()
        throw new Error(motivo)
      }

      setForm({ ...FORM_INICIAL, role: form.role })
      setMensagem(`${ROTULO_PERFIL[form.role]} "${username}" criado com sucesso!`)
      await carregar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  async function alternarAtivo(usuario) {
    setErro('')
    setMensagem('')
    const acao = usuario.ativo ? 'desativar' : 'ativar'
    const resposta = await fetchWithAuth(`${USUARIOS_API}/${usuario.id}/${acao}`, { method: 'PUT' })
    if (!resposta.ok) {
      setErro(await lerErro(resposta, `Não foi possível ${acao} o usuário.`))
      return
    }
    await carregar()
  }

  async function redefinirSenha(usuario) {
    const novaSenha = window.prompt(`Nova senha para ${usuario.username} (mínimo 8 caracteres):`)
    if (!novaSenha) return
    setErro('')
    setMensagem('')
    const resposta = await fetchWithAuth(`${USUARIOS_API}/${usuario.id}/senha`, {
      method: 'PUT',
      body: JSON.stringify({ novaSenha }),
    })
    if (!resposta.ok) {
      setErro(await lerErro(resposta, 'Não foi possível alterar a senha.'))
      return
    }
    setMensagem(`Senha de ${usuario.username} alterada.`)
  }

  function descreverCadastro(usuario) {
    if (usuario.role === 'ALUNO') {
      const aluno = alunos.find((a) => a.id === usuario.referenciaId)
      return aluno ? `${aluno.nome} · matrícula ${aluno.matricula}` : `Aluno #${usuario.referenciaId}`
    }
    if (usuario.role === 'PROFESSOR') {
      const professor = professores.find((p) => p.id === usuario.referenciaId)
      return professor ? `${professor.nome} · ${professor.email}` : `Professor #${usuario.referenciaId}`
    }
    return '—'
  }

  const ehAluno = form.role === 'ALUNO'
  const temCadastro = form.role !== 'ADMIN'

  return (
    <div className="usuarios-container">
      <div className="usuarios-header">
        <div>
          <h2>Usuários</h2>
          <p>Cadastre alunos, professores e administradores. Cada cadastro já cria o login de acesso.</p>
        </div>
        <span className="usuarios-total">{usuarios.length} usuários</span>
      </div>

      {mensagem && <p className="usuarios-sucesso" role="status">{mensagem}</p>}
      {erro && <p className="usuarios-erro" role="alert">{erro}</p>}

      <form className="usuarios-form" onSubmit={criar}>
        <h3>Novo usuário</h3>

        <div className="usuarios-perfis" role="radiogroup" aria-label="Tipo de usuário">
          {PERFIS.map((perfil) => (
            <button
              key={perfil.valor}
              type="button"
              role="radio"
              aria-checked={form.role === perfil.valor}
              className={`usuarios-perfil ${form.role === perfil.valor ? 'ativo' : ''}`}
              onClick={() => escolherPerfil(perfil.valor)}
            >
              <strong>{perfil.rotulo}</strong>
              <span>{perfil.descricao}</span>
            </button>
          ))}
        </div>

        {temCadastro && (
          <fieldset className="usuarios-secao">
            <legend>Dados do {ehAluno ? 'aluno' : 'professor'}</legend>
            <div className="usuarios-form-grid">
              <label>
                Nome completo
                <input name="nome" value={form.nome} onChange={alterarCampo} required maxLength={150} />
              </label>
              {ehAluno && (
                <label>
                  Matrícula
                  <input name="matricula" value={form.matricula} onChange={alterarCampo} required maxLength={50} />
                </label>
              )}
              <label>
                E-mail
                <input name="email" type="email" value={form.email} onChange={alterarCampo} required maxLength={150} />
              </label>
            </div>
          </fieldset>
        )}

        <fieldset className="usuarios-secao">
          <legend>Acesso ao sistema</legend>
          <div className="usuarios-form-grid">
            <label>
              Login
              <input name="username" value={form.username} onChange={alterarCampo} required minLength={3}
                maxLength={100} pattern="[A-Za-z0-9._\-]+" title="Use letras, números, ponto, hífen ou sublinhado"
                autoComplete="off" />
            </label>
            <label>
              Senha
              <input name="password" type="password" value={form.password} onChange={alterarCampo}
                required minLength={8} maxLength={72} autoComplete="new-password" />
            </label>
          </div>
        </fieldset>

        <button type="submit" className="usuarios-botao" disabled={salvando}>
          {salvando ? 'Criando...' : `Criar ${ROTULO_PERFIL[form.role].toLowerCase()}`}
        </button>
      </form>

      {carregando ? (
        <p>Carregando usuários...</p>
      ) : (
        <table className="usuarios-tabela">
          <thead>
            <tr>
              <th>Login</th>
              <th>Perfil</th>
              <th>Cadastro</th>
              <th>Situação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {usuarios.map((usuario) => (
              <tr key={usuario.id} className={usuario.ativo ? '' : 'inativo'}>
                <td>{usuario.username}</td>
                <td>{ROTULO_PERFIL[usuario.role] || usuario.role}</td>
                <td>{descreverCadastro(usuario)}</td>
                <td>{usuario.ativo ? 'Ativo' : 'Inativo'}</td>
                <td className="usuarios-acoes">
                  <button type="button" onClick={() => redefinirSenha(usuario)}>Senha</button>
                  <button type="button" onClick={() => alternarAtivo(usuario)}>
                    {usuario.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default Usuarios
