package org.example.camerastream.modules.eventhub.audit.repository;

import org.example.camerastream.modules.eventhub.audit.entity.AuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AuditLogRepository extends JpaRepository<AuditLog, Long>, AuditLogRepositoryCustom {
}
