package org.example.camerastream.common.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;

/**
 * Thread Pool Hierarchy Configuration (Adopted from HPticket Architecture)
 * Provides isolated, dedicated thread pools with bounded queues and CallerRunsPolicy
 * to prevent out-of-memory errors and eliminate thread contention under heavy video/AI load.
 */
@Configuration
@EnableAsync
public class AsyncConfig {

    /**
     * Dedicated pool for high-throughput AI events (Plate ANPR, FaceID, ROI Intrusion).
     * Decouples HTTP ingestion from DB persistence and WebSocket fan-out broadcasting.
     */
    @Bean(name = "cameraEventExecutor")
    public Executor cameraEventExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(20);
        executor.setMaxPoolSize(50);
        executor.setQueueCapacity(5000);
        executor.setThreadNamePrefix("CameraEvent-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.initialize();
        return executor;
    }

    /**
     * Dedicated pool for asynchronous Snapshot fetching from RTSP/ONVIF streams.
     * Prevents hardware latency (0.5s - 2s) from blocking client HTTP request threads.
     */
    @Bean(name = "cameraSnapshotExecutor")
    public Executor cameraSnapshotExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(8);
        executor.setMaxPoolSize(16);
        executor.setQueueCapacity(200);
        executor.setThreadNamePrefix("CameraSnapshot-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.initialize();
        return executor;
    }

    /**
     * Dedicated pool for concurrent multi-camera health checks.
     * Allows scanning 20+ cameras simultaneously in ~1.5s using CompletableFuture.allOf().
     */
    @Bean(name = "cameraHealthCheckExecutor")
    public Executor cameraHealthCheckExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(10);
        executor.setMaxPoolSize(30);
        executor.setQueueCapacity(500);
        executor.setThreadNamePrefix("CameraHealth-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.initialize();
        return executor;
    }

    /**
     * Dedicated pool for database backup, compression, and recovery tasks.
     */
    @Bean(name = "backupRecoveryExecutor")
    public Executor backupRecoveryExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(5);
        executor.setQueueCapacity(50);
        executor.setThreadNamePrefix("BackupRecovery-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.initialize();
        return executor;
    }
}
