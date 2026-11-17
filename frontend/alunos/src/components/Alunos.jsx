import { useCallback, useEffect, useState } from 'react'
import { getJson, getUsuario } from '../api/fetchWithAuth'
import './Alunos.css'

// Endpoints unificados no API Gateway
const API_URL = '/api/alunos'
const TURMAS_API = '/api/turmas'
const PRESENCAS_API = '/api/presencas'

/**
 * Aba somente de consulta:
 * ADMIN     -> todos os alunos (filtro opcional por turma, com a frequência)
 * PROFESSOR -> somente os alunos das suas turmas
 * ALUNO     -> somente os próprios dados e a frequência em cada turma
 * O usuário vem do Host (prop); fora do Host, lê da sessão.
 */
function Alunos({ usuario: usuarioProp }) {
  const usuario = usuarioProp || getUsuario()

  if (!usuario) {
    return <p className="mensagem-erro">Faça login para ver os alunos.</p>
  }
  if (usuario.role === 'ALUNO') {
    return <MeusDados alunoId={usuario.referenciaId} />
  }
  return <GestaoAlunos ehAdmin={usuario.role === 'ADMIN'} />
}

// =====================================================================================
// ADMIN e PROFESSOR: somente consulta (o cadastro de alunos fica na aba Usuários e
// as matrículas em "Gerenciar turmas", na aba Chamadas)
// =====================================================================================
function GestaoAlunos({ ehAdmin }) {
  const [alunos, setAlunos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [turmas, setTurmas] = useState([])
  const [turmaSelecionada, setTurmaSelecionada] = useState('')
  const [matriculados, setMatriculados] = useState([])
  const [frequencias, setFrequencias] = useState([])

  // 1. Turmas (o backend já devolve só as do professor)
  useEffect(() => {
    async function carregarTurmas() {
      try {
        const dados = await getJson(TURMAS_API, 'Não foi possível carregar as turmas.')
        setTurmas(dados)
        if (!ehAdmin && dados.length > 0) {
          setTurmaSelecionada(String(dados[0].id))
        } else if (!ehAdmin) {
          setCarregando(false)
        }
      } catch (e) {
        setErro(e.message)
        setCarregando(false)
      }
    }
    carregarTurmas()
  }, [ehAdmin])

  // 2. Alunos: ADMIN vê todos; PROFESSOR vê os matriculados na turma selecionada
  const buscarAlunos = useCallback(async () => {
    try {
      setErro('')
      if (ehAdmin) {
        setAlunos(await getJson(API_URL, 'Não foi possível carregar os alunos.'))
        return
      }
      if (!turmaSelecionada) return
      const ids = await getJson(`${TURMAS_API}/${turmaSelecionada}/alunos`, 'Não foi possível carregar os alunos da turma.')
      setAlunos(ids.length === 0 ? [] : await getJson(`${API_URL}?ids=${ids.join(',')}`, 'Não foi possível carregar os alunos.'))
    } catch (e) {
      setErro(e.message)
    } finally {
      setCarregando(false)
    }
  }, [ehAdmin, turmaSelecionada])

  useEffect(() => {
    buscarAlunos()
  }, [buscarAlunos])

  // 3. Matrículas e frequências da turma selecionada
  const carregarDadosDaTurma = useCallback(async () => {
    if (!turmaSelecionada) {
      setMatriculados([])
      setFrequencias([])
      return
    }
    try {
      const [ids, freq] = await Promise.all([
        getJson(`${TURMAS_API}/${turmaSelecionada}/alunos`, 'Erro ao carregar matrículas.'),
        getJson(`${PRESENCAS_API}/turma/${turmaSelecionada}`, 'Erro ao carregar frequências.'),
      ])
      setMatriculados(ids)
      setFrequencias(freq)
    } catch (e) {
      console.error('Erro ao carregar dados da turma:', e)
      setMatriculados([])
      setFrequencias([])
    }
  }, [turmaSelecionada])

  useEffect(() => {
    carregarDadosDaTurma()
  }, [carregarDadosDaTurma])

  const turmaAtual = turmas.find((t) => String(t.id) === turmaSelecionada)
  // ADMIN: sem turma escolhida mostra todos; com turma, só os matriculados nela
  const alunosVisiveis = ehAdmin && turmaAtual
    ? alunos.filter((a) => matriculados.includes(a.id))
    : alunos

  return (
    <div className="alunos-container">
      <div className="alunos-header">
        <div>
          <h2>Alunos</h2>
          <p>
            {ehAdmin
              ? 'Todos os alunos cadastrados. Novos alunos são criados na aba Usuários.'
              : 'Alunos matriculados nas suas turmas.'}
          </p>
        </div>

        <div className="alunos-header-acoes">
          <span className="total-alunos">{alunosVisiveis.length} alunos</span>
        </div>
      </div>

      {erro && <p className="mensagem-erro" role="alert">{erro}</p>}

      {turmas.length > 0 && (
        <div className="filtro-frequencia">
          <label htmlFor="turmaFrequencia">Turma:</label>
          <select id="turmaFrequencia" value={turmaSelecionada}
            onChange={(event) => setTurmaSelecionada(event.target.value)}>
            {ehAdmin && <option value="">Todas as turmas</option>}
            {turmas.map((turma) => (
              <option key={turma.id} value={turma.id}>
                {turma.nome} — {turma.disciplinaNome}
              </option>
            ))}
          </select>
        </div>
      )}

      {carregando && <p>Carregando alunos...</p>}

      {!carregando && !ehAdmin && turmas.length === 0 && !erro && (
        <p>Você ainda não tem turmas atribuídas.</p>
      )}

      {!carregando && !erro && alunosVisiveis.length === 0 && (ehAdmin || turmas.length > 0) && (
        <p>{ehAdmin && !turmaAtual ? 'Nenhum aluno cadastrado.' : 'Nenhum aluno matriculado nesta turma.'}</p>
      )}

      {!carregando && alunosVisiveis.length > 0 && (
        <div className="alunos-grid">
          {alunosVisiveis.map((aluno) => {
            const frequencia = frequencias.find((item) => item.alunoId === aluno.id)

            return (
              <div className="aluno-card" key={aluno.id}>
                <div className="aluno-avatar">{aluno.nome?.charAt(0).toUpperCase() || '?'}</div>

                <div className="aluno-info">
                  <h3>{aluno.nome}</h3>
                  <span>Matrícula: {aluno.matricula}</span>
                  <span className="aluno-email">{aluno.email}</span>
                </div>

                {turmaAtual && (
                  <div className="presenca">
                    <span>Frequência</span>
                    {!frequencia ? (
                      <strong>Sem dados</strong>
                    ) : (
                      <strong className={frequencia.alertaRiscoReprovacao ? 'frequencia-baixa' : 'frequencia-aprovada'}>
                        {frequencia.percentual.toFixed(1)}%
                      </strong>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// =====================================================================================
// ALUNO: somente os próprios dados
// =====================================================================================
function MeusDados({ alunoId }) {
  const [aluno, setAluno] = useState(null)
  const [frequencias, setFrequencias] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    async function carregar() {
      try {
        const [dados, freq] = await Promise.all([
          getJson(`${API_URL}/${alunoId}`, 'Não foi possível carregar seus dados.'),
          getJson(`${PRESENCAS_API}/aluno/${alunoId}`, 'Não foi possível carregar sua frequência.'),
        ])
        setAluno(dados)
        setFrequencias(freq)
      } catch (e) {
        setErro(e.message)
      } finally {
        setCarregando(false)
      }
    }
    if (alunoId) {
      carregar()
    } else {
      setErro('Seu login não está vinculado a um aluno. Procure a secretaria.')
      setCarregando(false)
    }
  }, [alunoId])

  if (carregando) return <div className="alunos-container"><p>Carregando seus dados...</p></div>

  return (
    <div className="alunos-container">
      <div className="alunos-header">
        <div>
          <h2>Alunos</h2>
          <p>Seus dados cadastrais e sua frequência em cada disciplina.</p>
        </div>
      </div>

      {erro && <p className="mensagem-erro" role="alert">{erro}</p>}

      {aluno && (
        <div className="meus-dados-card">
          <div className="aluno-avatar">{aluno.nome?.charAt(0).toUpperCase() || '?'}</div>
          <div className="aluno-info">
            <h3>{aluno.nome}</h3>
            <span>Matrícula: {aluno.matricula}</span>
            <span className="aluno-email">{aluno.email}</span>
          </div>
        </div>
      )}

      {!erro && frequencias.length === 0 && <p>Você ainda não está matriculado em nenhuma turma.</p>}

      {frequencias.length > 0 && (
        <table className="frequencia-tabela">
          <thead>
            <tr>
              <th>Disciplina</th>
              <th>Turma</th>
              <th>Presenças</th>
              <th>Faltas</th>
              <th>Frequência</th>
            </tr>
          </thead>
          <tbody>
            {frequencias.map((f) => (
              <tr key={f.turmaId}>
                <td>{f.disciplinaNome || '—'}</td>
                <td>{f.turmaNome}</td>
                <td>{f.totalPresencas} de {f.totalChamadas}</td>
                <td>{f.faltas}</td>
                <td>
                  <strong className={f.alertaRiscoReprovacao ? 'frequencia-baixa' : 'frequencia-aprovada'}>
                    {f.percentual.toFixed(1)}%
                  </strong>
                  {f.alertaRiscoReprovacao && <span className="alerta-frequencia">abaixo de 75%</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default Alunos
