package org.example.camerastream.modules.backup.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ManifestDTO {
    private String backupId;
    private String databaseName;
    private String version;
    private Long fileSizeBytes;
    private String checksumSha256;
    private String createdAt;
    private String compression;
    private List<String> includedTables;
    private Long totalRows;
}
