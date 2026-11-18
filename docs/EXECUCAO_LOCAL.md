# Sistema de Chamadas — Execução Local

Passo a passo para rodar **toda a aplicação** no seu computador: bancos de dados, API Gateway, microsserviços do backend e frontend (host + 3 microfrontends). Este documento é o mesmo nos três repositórios.

| Repositório | Pasta usada aqui |
| --- | --- |
| `SistemaDeChamada_api-gateway` | `api-gateway/` |
| `SistemaDeChamada_backend` | `backend/aluno-service/` e `backend/turma-service/` |
| `SistemaDeChamada_frontend` | `frontend/` |

Clone os três repositórios lado a lado, na mesma pasta.

## 1. Pré-requisitos

| Ferramenta | Versão | Para quê |
| --- | --- | --- |
| **Java (JDK)** | 17 | API Gateway, `aluno-service` e `turma-service` |
| **Maven** | 3.9+ (opcional) | Cada projeto Java já traz o *wrapper* `mvnw` / `mvnw.cmd`; o Maven instalado não é obrigatório |
| **Node.js** | 20.19+ ou 22.12+ (com npm) | Frontend (o host usa Vite 8, que exige essas versões) |
| **Docker** (Docker Desktop no Windows) | Recente | Subir SQL Server e MongoDB localmente |
| **Git** | Recente | Clonar os repositórios |

Portas usadas:

| Módulo | Porta |
| --- | --- |
| SQL Server (Docker) | 1433 |
| MongoDB (Docker) | 27017 |
| API Gateway | **8080** |
| `aluno-service` | **8081** |
| `turma-service` | **8083** |
| `host` (frontend) | **5173** |
| `alunos` / `chamadas` / `registro-presenca` | **5174** / **5175** / **5176** |

> Localmente o **Azure Service Bus fica desligado** (`AZURE_SERVICEBUS_ENABLED=false`). O sistema funciona normalmente; os eventos de chamada finalizada só ficam guardados na tabela `outbox_eventos` do `turma-service`.

## 2. Bancos de dados (Docker)

### 2.1 SQL Server (usuários do Gateway e banco do `turma-service`)

```bash
docker run -d --name sql-chamadas -p 1433:1433 \
  -e "ACCEPT_EULA=Y" -e "MSSQL_SA_PASSWORD=Chamadas#2026" \
  mcr.microsoft.com/mssql/server:2022-latest
```

No PowerShell, escreva o comando em uma linha só (sem as barras `\`).

Espere cerca de 20 segundos e crie os dois bancos:

```bash
docker exec -it sql-chamadas /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "Chamadas#2026" -C \
  -Q "CREATE DATABASE [gateway-db]; CREATE DATABASE [turma-db];"
```

As **tabelas não precisam ser criadas**: o Flyway cria tudo na primeira subida do Gateway (`usuarios`) e do `turma-service` (V1 a V5).

### 2.2 MongoDB (banco do `aluno-service`)

```bash
docker run -d --name mongo-chamadas -p 27017:27017 mongo:7
```

O banco `chamadas_alunos` e as coleções `alunos` e `contadores` são criados automaticamente no primeiro cadastro.

## 3. Variáveis de ambiente

As configurações ficam em `application.yml` (Gateway) e `application.properties` (serviços), mas **os valores sensíveis vêm só de variáveis de ambiente**: sem elas, o serviço não sobe. Use o **mesmo `JWT_SECRET` nos três serviços Java** (mínimo de 32 caracteres).

Defina as variáveis no mesmo terminal em que vai rodar cada serviço. Exemplos em **PowerShell** (Windows); no bash/zsh troque `$env:NOME="valor"` por `export NOME="valor"`.

### 3.1 API Gateway (terminal 1)

```powershell
$env:JWT_SECRET="troque-por-um-texto-aleatorio-com-32-ou-mais-caracteres"
$env:GATEWAY_DB_URL="jdbc:sqlserver://localhost:1433;databaseName=gateway-db;encrypt=true;trustServerCertificate=true"
$env:GATEWAY_DB_USER="sa"
$env:GATEWAY_DB_PASSWORD="Chamadas#2026"
$env:ADMIN_INITIAL_PASSWORD="admin12345"
```

Já têm valor padrão para rodar local: `ALUNO_SERVICE_URL` (`http://localhost:8081`), `TURMA_SERVICE_URL` (`http://localhost:8083`), `ADMIN_INITIAL_USERNAME` (`admin`) e `JWT_EXPIRATION_MS` (8 h). As origens `http://localhost:5173` a `5176` já estão liberadas no CORS do `application.yml`.

### 3.2 `turma-service` (terminal 2)

```powershell
$env:JWT_SECRET="troque-por-um-texto-aleatorio-com-32-ou-mais-caracteres"
$env:AZURE_SQL_URL="jdbc:sqlserver://localhost:1433;databaseName=turma-db;encrypt=true;trustServerCertificate=true"
$env:AZURE_SQL_USERNAME="sa"
$env:AZURE_SQL_PASSWORD="Chamadas#2026"
$env:AZURE_SERVICEBUS_ENABLED="false"
```

`ALUNO_SERVICE_URL` já aponta para `http://localhost:8081`. O horário da chamada é enviado como `TIME` pelo próprio `application.properties` (`sendTimeAsDatetime=false`).

### 3.3 `aluno-service` (terminal 3)

```powershell
$env:JWT_SECRET="troque-por-um-texto-aleatorio-com-32-ou-mais-caracteres"
$env:SPRING_DATA_MONGODB_URI="mongodb://localhost:27017"
$env:AZURE_SERVICEBUS_ENABLED="false"
```

`TURMA_SERVICE_URL` já aponta para `http://localhost:8083` e o banco padrão é `chamadas_alunos`.

### 3.4 Frontend

Nada obrigatório: sem `VITE_API_URL`, o frontend chama o Gateway em `http://localhost:8080`. Para usar outro endereço, crie `frontend/host/.env.local` (e o mesmo nos remotos) com `VITE_API_URL=http://localhost:8080`.

## 4. Ordem de inicialização e comandos

Suba nesta ordem: **bancos de dados → API Gateway → microsserviços → frontend**. Cada serviço Java fica em um terminal próprio, com as variáveis da seção 3 já definidas.

### Passo 1 — Bancos de dados

```bash
docker start sql-chamadas mongo-chamadas
```

(Na primeira vez, use os comandos `docker run` da seção 2.)

### Passo 2 — API Gateway (porta 8080)

```powershell
cd SistemaDeChamada_api-gateway/api-gateway
.\mvnw.cmd spring-boot:run        # Linux/macOS: ./mvnw spring-boot:run
```

Pronto quando aparecer `Usuário ADMIN inicial 'admin' criado.` (só na primeira vez) e `Started ...`. Teste: http://localhost:8080/actuator/health → `{"status":"UP"}`.

### Passo 3 — `turma-service` (porta 8083)

```powershell
cd SistemaDeChamada_backend/backend/turma-service
.\mvnw.cmd spring-boot:run
```

Na primeira vez, o log mostra o Flyway aplicando as migrações 1 a 5 no `turma-db`.

### Passo 4 — `aluno-service` (porta 8081)

```powershell
cd SistemaDeChamada_backend/backend/aluno-service
.\mvnw.cmd spring-boot:run
```

O aviso `Consumer do Azure Service Bus NÃO iniciado` é esperado localmente (Service Bus desligado).

### Passo 5 — Frontend (portas 5173 a 5176)

```bash
cd SistemaDeChamada_frontend/frontend
npm run install:all      # só na primeira vez (instala host e os 3 remotos)
npm run build:remotes    # compila alunos, chamadas e registro-presenca
npm run start            # sobe os 3 remotos (vite preview) e o host (vite dev)
```

Abra **http://localhost:5173** e entre com `admin` / o valor de `ADMIN_INITIAL_PASSWORD`.

> Alterou algo em `alunos`, `chamadas` ou `registro-presenca`? Rode `npm run build:remotes` de novo e reinicie o `npm run start`: os remotos são servidos já compilados. Alterações no `host` aparecem na hora.

## 5. Roteiro rápido de teste

1. **Usuários:** crie um professor e um aluno (o cadastro e o login são criados juntos).
2. **Chamadas → Gerenciar turmas:** crie uma disciplina, uma turma (disciplina + professor) e matricule o aluno.
3. **+ Criar chamada:** escolha a turma, a data e o horário; abra a chamada, registre a presença e finalize.
4. Saia e entre com o professor e depois com o aluno, para conferir o que cada perfil vê.
5. Swagger de todas as APIs (pelo Gateway): http://localhost:8080/swagger-ui.html (use o token do login em **Authorize**).

## 6. Testes automatizados

```bash
# em api-gateway/, backend/turma-service/ e backend/aluno-service/
./mvnw test        # Windows: .\mvnw.cmd test
```

Os testes de arquitetura (ArchUnit) e unitários não precisam de banco nem de Service Bus.

## 7. Problemas comuns

| Sintoma | Causa provável |
| --- | --- |
| Serviço não sobe com `Could not resolve placeholder` | Variável obrigatória não definida **naquele terminal** |
| `JWT_SECRET ausente ou com menos de 32 caracteres` | Segredo curto ou diferente entre os serviços |
| Login dá 401 com a senha certa | O admin foi criado antes com outra `ADMIN_INITIAL_PASSWORD`; apague a linha em `gateway-db.dbo.usuarios` e reinicie o Gateway |
| Telas dão 401 depois do login | `JWT_SECRET` diferente em algum serviço |
| Telas dão 502 | O serviço daquela tela (8081 ou 8083) não está rodando |
| `Login failed for user 'sa'` / conexão recusada na 1433 | Container do SQL Server parado ou senha diferente da usada no `docker run` |
| Tela branca ou "Não foi possível carregar o módulo" | Remotos não compilados: rode `npm run build:remotes` e reinicie o `npm run start` |
| Porta já em uso | Outro processo usando 8080/8081/8083/5173–5176; encerre-o ou altere a porta (`PORT` nos serviços Java) |
