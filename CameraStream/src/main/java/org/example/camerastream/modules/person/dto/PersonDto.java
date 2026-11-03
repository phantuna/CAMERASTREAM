package org.example.camerastream.modules.person.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PersonDto {
    private Long id;
    private String fullName;
    private String employeeCode;
    private String department;
    private String role;
    private String primaryPhotoUrl;
    private String status;
    private int trainedPhotosCount;
    private String registeredDate;
    private List<PersonImageDto> images;
}
