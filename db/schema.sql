-- =============================================================================
-- PokerControl — esquema PostgreSQL normalizado
--
-- Migra el modelo hoy persistido en AsyncStorage (ver src/storage/types.ts,
-- storage.ts, seasons.ts, debts.ts) a tablas relacionales en 3FN. Cada tabla
-- indica de qué clave/estructura de AsyncStorage proviene.
--
-- Convenciones:
--   - IDs de entidades que hoy genera la app en el cliente (genId() en
--     src/storage/id.ts, formato "<timestamp>-<random>") se mantienen como
--     TEXT PK, para poder migrar los datos existentes 1:1 sin remapear ids.
--   - IDs de filas que la app nunca expone como entidad propia (compras,
--     pagos, backups) usan IDENTITY numérico.
--   - Montos en NUMERIC(12,2) (la app usa Number de JS sin decimales fijos,
--     pero pesos con centavos es el caso general más seguro).
--   - Fechas ISO 8601 (createdAt, timestamp, date, etc.) -> TIMESTAMPTZ.
-- =============================================================================

BEGIN;

-- ─── players ──────────────────────────────────────────────────────────────
-- Antes: AsyncStorage "poker_players" (array de Player)
CREATE TABLE players (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- La app actual borra jugadores sin chequear referencias (deletePlayer
    -- en storage.ts), lo que en un modelo normalizado rompería FKs de
    -- session_participants/debts en cuanto el jugador tenga historial.
    -- archived_at reemplaza ese borrado: la UI "elimina" archivando, y solo
    -- se permite DELETE real cuando el jugador no tiene filas relacionadas
    -- (las FKs de abajo son ON DELETE RESTRICT para eso).
    archived_at TIMESTAMPTZ NULL
);

-- ─── player_adjustments ──────────────────────────────────────────────────
-- Antes: Player.adjustments[] (PlayerAdjustment)
CREATE TABLE player_adjustments (
    id           TEXT PRIMARY KEY,
    player_id    TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    description  TEXT NOT NULL,
    amount       NUMERIC(12, 2) NOT NULL,
    occurred_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_player_adjustments_player ON player_adjustments(player_id);

-- ─── seasons ─────────────────────────────────────────────────────────────
-- Antes: AsyncStorage "poker_seasons" (array de Season)
CREATE TABLE seasons (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at   TIMESTAMPTZ NULL,
    status      TEXT NOT NULL CHECK (status IN ('active', 'closed')),
    CHECK ((status = 'closed') = (closed_at IS NOT NULL))
);

-- createSeason()/reopenSeason() en seasons.ts garantizan a mano que solo
-- haya una temporada activa a la vez; el índice lo hace invariante en DB.
CREATE UNIQUE INDEX idx_seasons_single_active ON seasons(status) WHERE status = 'active';

-- ─── sessions ────────────────────────────────────────────────────────────
-- Antes: AsyncStorage "poker_sessions" (array de Session, sin participants)
CREATE TABLE sessions (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at   TIMESTAMPTZ NULL,
    status      TEXT NOT NULL CHECK (status IN ('active', 'closed')),
    season_id   TEXT NULL REFERENCES seasons(id) ON DELETE SET NULL,
    CHECK ((status = 'closed') = (closed_at IS NOT NULL))
);

CREATE INDEX idx_sessions_season ON sessions(season_id);
CREATE INDEX idx_sessions_status ON sessions(status);

-- ─── session_participants ────────────────────────────────────────────────
-- Antes: Session.participants[] (Participant, sin el array buys ni el
-- "name" redundante -- el nombre se obtiene por join a players).
CREATE TABLE session_participants (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    player_id     TEXT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
    final_amount  NUMERIC(12, 2) NULL,
    UNIQUE (session_id, player_id)
);

CREATE INDEX idx_session_participants_session ON session_participants(session_id);
CREATE INDEX idx_session_participants_player ON session_participants(player_id);

-- ─── buys ────────────────────────────────────────────────────────────────
-- Antes: Participant.buys[] (Buy)
CREATE TABLE buys (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    participant_id  BIGINT NOT NULL REFERENCES session_participants(id) ON DELETE CASCADE,
    amount          NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    occurred_at     TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_buys_participant ON buys(participant_id);

-- ─── debts ───────────────────────────────────────────────────────────────
-- Antes: AsyncStorage "poker_debts" (array de Debt). fromPlayer/toPlayer se
-- normalizan a FKs (el nombre sale de players.name); session_id es nullable
-- porque el modelo original usa dos ids sintéticos que no son partidas
-- reales: MANUAL_DEBT_SESSION_ID = 'ajuste_previo' (deuda manual) y
-- 'neteado' (deuda consolidada sin origen manual). Esos dos casos quedan
-- representados por source_type + session_id NULL; session_name original
-- (snapshot de texto tomado al crear la deuda, para no romperse si la
-- partida se renombra después) se conserva como label.
CREATE TABLE debts (
    id               TEXT PRIMARY KEY,
    from_player_id   TEXT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
    to_player_id     TEXT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
    session_id       TEXT NULL REFERENCES sessions(id) ON DELETE SET NULL,
    source_type      TEXT NOT NULL CHECK (source_type IN ('session', 'manual', 'consolidated')),
    label            TEXT NOT NULL, -- snapshot de sessionName ("Deuda consolidada", "Ajuste previo", nombre de partida, etc.)
    original_amount  NUMERIC(12, 2) NOT NULL CHECK (original_amount > 0),
    pending_amount   NUMERIC(12, 2) NOT NULL CHECK (pending_amount >= 0 AND pending_amount <= original_amount),
    status           TEXT NOT NULL CHECK (status IN ('pending', 'partial', 'paid')),
    is_consolidated  BOOLEAN NOT NULL DEFAULT false,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (from_player_id <> to_player_id),
    -- session_id solo tiene sentido cuando la deuda vino de una partida real
    CHECK ((source_type = 'session') = (session_id IS NOT NULL))
);

CREATE INDEX idx_debts_from_player ON debts(from_player_id);
CREATE INDEX idx_debts_to_player ON debts(to_player_id);
CREATE INDEX idx_debts_session ON debts(session_id);
CREATE INDEX idx_debts_status ON debts(status);

-- ─── debt_payments ───────────────────────────────────────────────────────
-- Antes: Debt.payments[] (DebtPayment)
CREATE TABLE debt_payments (
    id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    debt_id  TEXT NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
    amount   NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    paid_at  TIMESTAMPTZ NOT NULL,
    note     TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_debt_payments_debt ON debt_payments(debt_id);

-- ─── debt_backups ────────────────────────────────────────────────────────
-- Antes: AsyncStorage "poker_debts_backup" (DebtBackup: snapshot completo
-- de "poker_debts" tomado por reNetAllDebts(), restaurado entero por
-- undoReNet() o descartado por clearBackup()). Es un buffer de undo de
-- una sola operación, no datos de dominio a normalizar: la app siempre lo
-- lee/escribe/borra como un blob opaco completo, nunca consulta deudas
-- individuales dentro de él. Guardarlo como JSONB refleja exactamente ese
-- uso; solo debe existir 0 o 1 fila viva (la app pisa/borra el backup
-- anterior en cada cierre de partida o reNet).
CREATE TABLE debt_backups (
    id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    saved_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    snapshot  JSONB NOT NULL -- copia de las filas de debts + debt_payments al momento del backup
);

COMMIT;
