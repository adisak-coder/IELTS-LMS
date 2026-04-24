-- Shared websocket capacity tracking for single-instance and multi-replica deployments.
-- The capacity table stores current counters, while the lease table provides crash recovery.

CREATE TABLE IF NOT EXISTS websocket_connection_capacity (
    scope_type VARCHAR(16) NOT NULL,
    scope_id VARCHAR(255) NOT NULL,
    active_count BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (scope_type, scope_id)
);

CREATE TABLE IF NOT EXISTS websocket_connection_leases (
    id CHAR(36) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    schedule_id CHAR(36) NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_websocket_connection_leases_expires_at (expires_at),
    INDEX idx_websocket_connection_leases_schedule_expires (schedule_id, expires_at),
    INDEX idx_websocket_connection_leases_user_expires (user_id, expires_at)
);
