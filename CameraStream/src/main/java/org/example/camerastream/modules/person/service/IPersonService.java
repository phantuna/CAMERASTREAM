package org.example.camerastream.modules.person.service;

import org.example.camerastream.modules.person.dto.PersonDto;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

public interface IPersonService {
    List<PersonDto> getAllPeople();
    Page<PersonDto> getPeoplePaginated(String search, Pageable pageable);
    Page<PersonDto> getPeoplePaginated(String search, String department, String status, Pageable pageable);
    PersonDto getPersonById(Long id);
    PersonDto registerPerson(
            String fullName,
            String employeeCode,
            String department,
            String role,
            List<MultipartFile> imageFiles,
            List<String> angles,
            Integer primaryIndex
    );
    void deletePerson(Long id);
    PersonDto updatePerson(Long id, String fullName, String employeeCode, String department, String role, String status);
    Resource loadFaceImage(String filename);
    Map<String, Object> bulkImportFromZip(MultipartFile zipFile);
}
