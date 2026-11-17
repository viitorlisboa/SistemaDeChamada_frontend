import { useCallback, useEffect, useState } from 'react'
import { fetchWithAuth, getJson, lerErro } from '../api/fetchWithAuth'

// Cadastro de disciplinas, turmas e matrículas (somente ADMIN).
// Sem turma não existe chamada: este painel é o caminho para criar a primeira.
const TURMAS_API = '/api/turmas'
const DISCIPLINAS_API = '/api/disciplinas'
const PROFESSORES_API = '/api/professores'
const ALUNOS_API = '/api/alunos'

const DISCIPLINA_INICIAL = { nome: '', codigo: '' }
const TURMA_INICIAL = { nome: '', disciplinaId: '', professorId: '' }

function GestaoTurmas({ turmas, onAlterado }) {
  const [disciplinas, setDisciplinas] = useState([])
  const [professores, setProfessores] = useState([])
  const [alunos, setAlunos] = useState([])
  const [novaDisciplina, setNovaDisciplina] = useState(DISCIPLINA_INICIAL)
  const [novaTurma, setNovaTurma] = useState(TURMA_INICIAL)
  const [turmaAberta, setTurmaAberta] = useState(null)
  const [matriculados, setMatriculados] = useState([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')

  const carregarCadastros = useCallback(async () => {
    try {
      const [listaDisciplinas, listaProfessores, listaAlunos] = await Promise.all([
        getJson(DISCIPLINAS_API, 'Não foi possível carregar as disciplinas.'),
        getJson(PROFESSORES_API, 'Não foi possível carregar os professores.'),
        getJson(ALUNOS_API, 'Não foi possível carregar os alunos.'),
      ])
      setDisciplinas(listaDisciplinas)
      setProfessores(listaProfessores)
      setAlunos(listaAlunos)
    } catch (e) {
      setErro(e.message)
    }
  }, [])

  useEffect(() => {
    carregarCadastros()
  }, [carregarCadastros])

  const carregarMatriculas = useCallback(async (turmaId) => {
    if (!turmaId) {
      setMatriculados([])
      return
    }
    try {
      setMatriculados(await getJson(`${TURMAS_API}/${turmaId}/alunos`, 'Não foi possível carregar as matrículas.'))
    } catch (e) {
      setErro(e.message)
    }
  }, [])

  useEffect(() => {
    carregarMatriculas(turmaAberta)
  }, [turmaAberta, carregarMatriculas])

  /** POST/DELETE com mensagens padronizadas. Devolve true se deu certo. */
  async function enviar(url, metodo, corpo, falha, sucesso) {
    setErro('')
    setMensagem('')
    setSalvando(true)
    try {
      const resposta = await fetchWithAuth(url, {
        method: metodo,
        ...(corpo ? { body: JSON.stringify(corpo) } : {}),
      })
      if (!resposta.ok) {
        throw new Error(await lerErro(resposta, falha))
      }
      if (sucesso) setMensagem(sucesso)
      return true
    } catch (e) {
      setErro(e.message)
      return false
    } finally {
      setSalvando(false)
    }
  }

  async function criarDisciplina(evento) {
    evento.preventDefault()
    const corpo = { nome: novaDisciplina.nome.trim(), codigo: novaDisciplina.codigo.trim() }
    if (await enviar(DISCIPLINAS_API, 'POST', corpo, 'Não foi possível criar a disciplina.',
      `Disciplina "${corpo.nome}" criada.`)) {
      setNovaDisciplina(DISCIPLINA_INICIAL)
      await carregarCadastros()
    }
  }

  async function criarTurma(evento) {
    evento.preventDefault()
    const corpo = {
      nome: novaTurma.nome.trim(),
      disciplinaId: Number(novaTurma.disciplinaId),
      professorId: Number(novaTurma.professorId),
    }
    if (await enviar(TURMAS_API, 'POST', corpo, 'Não foi possível criar a turma.', `Turma "${corpo.nome}" criada.`)) {
      setNovaTurma(TURMA_INICIAL)
      await onAlterado()
    }
  }

  async function excluirTurma(turma) {
    if (!window.confirm(`Excluir a turma ${turma.nome}?`)) return
    if (await enviar(`${TURMAS_API}/${turma.id}`, 'DELETE', null, 'Não foi possível excluir a turma.',
      `Turma "${turma.nome}" excluída.`)) {
      if (turmaAberta === turma.id) setTurmaAberta(null)
      await onAlterado()
    }
  }

  async function alternarMatricula(turma, aluno) {
    const matriculado = matriculados.includes(aluno.id)
    const ok = matriculado
      ? await enviar(`${TURMAS_API}/${turma.id}/alunos/${aluno.id}`, 'DELETE', null,
        'Não foi possível remover o aluno da turma.', `${aluno.nome} removido de ${turma.nome}.`)
      : await enviar(`${TURMAS_API}/${turma.id}/alunos`, 'POST', { alunoId: aluno.id },
        'Não foi possível matricular o aluno.', `${aluno.nome} matriculado em ${turma.nome}.`)
    if (ok) await carregarMatriculas(turma.id)
  }

  function campoTurma(evento) {
    const { name, value } = evento.target
    setNovaTurma((atual) => ({ ...atual, [name]: value }))
  }

  function campoDisciplina(evento) {
    const { name, value } = evento.target
    setNovaDisciplina((atual) => ({ ...atual, [name]: value }))
  }

  return (
    <div className="turmas-painel">
      <h3>Gerenciar turmas</h3>
      <p className="turmas-ajuda">
        Para criar uma chamada é preciso ter uma turma. A turma liga uma disciplina a um professor;
        professores e alunos são cadastrados na aba <strong>Usuários</strong>.
      </p>

      {mensagem && <p className="chamadas-sucesso" role="status">{mensagem}</p>}
      {erro && <p className="chamadas-erro" role="alert">{erro}</p>}

      <div className="turmas-formularios">
        <form className="turmas-form" onSubmit={criarDisciplina}>
          <h4>1. Nova disciplina</h4>
          <label>
            Nome
            <input name="nome" value={novaDisciplina.nome} onChange={campoDisciplina} required maxLength={100}
              placeholder="Ex.: Matemática" />
          </label>
          <label>
            Código
            <input name="codigo" value={novaDisciplina.codigo} onChange={campoDisciplina} required maxLength={20}
              placeholder="Ex.: MAT101" />
          </label>
          <button type="submit" className="botao-criar-chamada" disabled={salvando}>Criar disciplina</button>
        </form>

        <form className="turmas-form" onSubmit={criarTurma}>
          <h4>2. Nova turma</h4>
          <label>
            Nome da turma
            <input name="nome" value={novaTurma.nome} onChange={campoTurma} required maxLength={100}
              placeholder="Ex.: 3º A - manhã" />
          </label>
          <label>
            Disciplina
            <select name="disciplinaId" value={novaTurma.disciplinaId} onChange={campoTurma} required>
              <option value="">{disciplinas.length ? 'Selecione' : 'Crie uma disciplina primeiro'}</option>
              {disciplinas.map((d) => (
                <option key={d.id} value={d.id}>{d.nome} ({d.codigo})</option>
              ))}
            </select>
          </label>
          <label>
            Professor
            <select name="professorId" value={novaTurma.professorId} onChange={campoTurma} required>
              <option value="">{professores.length ? 'Selecione' : 'Cadastre um professor na aba Usuários'}</option>
              {professores.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="botao-criar-chamada"
            disabled={salvando || disciplinas.length === 0 || professores.length === 0}>
            Criar turma
          </button>
        </form>
      </div>

      <h4 className="turmas-subtitulo">3. Turmas e matrículas</h4>
      {turmas.length === 0 && <p className="turmas-ajuda">Nenhuma turma cadastrada ainda.</p>}

      <ul className="turmas-lista">
        {turmas.map((turma) => {
          const aberta = turmaAberta === turma.id
          return (
            <li key={turma.id} className="turma-item">
              <div className="turma-linha">
                <div>
                  <strong>{turma.nome}</strong>
                  <span>{turma.disciplinaNome} · Prof. {turma.professorNome}</span>
                </div>
                <div className="turma-botoes">
                  <button type="button" onClick={() => setTurmaAberta(aberta ? null : turma.id)}>
                    {aberta ? 'Fechar' : 'Alunos da turma'}
                  </button>
                  <button type="button" className="turma-excluir" onClick={() => excluirTurma(turma)} disabled={salvando}>
                    Excluir
                  </button>
                </div>
              </div>

              {aberta && (
                <div className="turma-alunos">
                  {alunos.length === 0 && <p className="turmas-ajuda">Nenhum aluno cadastrado (cadastre na aba Usuários).</p>}
                  {alunos.map((aluno) => {
                    const matriculado = matriculados.includes(aluno.id)
                    return (
                      <div key={aluno.id} className="turma-aluno">
                        <span>{aluno.nome} <small>({aluno.matricula})</small></span>
                        <button type="button" className={matriculado ? 'remover' : ''} disabled={salvando}
                          onClick={() => alternarMatricula(turma, aluno)}>
                          {matriculado ? 'Remover' : 'Matricular'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default GestaoTurmas
