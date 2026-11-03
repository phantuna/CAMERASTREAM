package org.example.camerastream.common.config;

import lombok.extern.slf4j.Slf4j;
import org.flywaydb.core.Flyway;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;

@Configuration
@Slf4j
public class FlywayConfig {

    @Bean
    public Flyway flyway(DataSource dataSource) {
        log.info("[Flyway] Đang thực thi migration tự động từ classpath:db/migration...");
        Flyway flyway = Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration")
                .baselineOnMigrate(true)
                .baselineVersion("0")
                .outOfOrder(true)
                .load();
        try {
            int migrationsApplied = flyway.migrate().migrationsExecuted;
            log.info("[Flyway] Migration CSDL thành công! Số script đã thực thi: {}", migrationsApplied);
        } catch (Exception e) {
            log.error("[Flyway] Lỗi khi thực thi migration: {}", e.getMessage(), e);
        }
        return flyway;
    }
}

