package org.example.camerastream.modules.backup.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RestoreRequest {
    private String backupId;
    private Boolean cleanExistingTables;
    private String notes;
}
