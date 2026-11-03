package org.example.camerastream.modules.person.controller;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.common.dto.ApiResponse;
import org.example.camerastream.common.security.annotation.RequirePermission;
import org.example.camerastream.modules.person.dto.PersonDto;
import org.example.camerastream.modules.person.service.IPersonService;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/people")
@RequiredArgsConstructor
@Slf4j
public class PersonController {

    private final IPersonService personService;

    @RequirePermission("FACE_VIEW")
    @GetMapping
    public ApiResponse<?> getPeople(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false, defaultValue = "10") Integer size) {
        try {
            if (page != null) {
                return ApiResponse.success(personService.getPeoplePaginated(
                        search,
                        PageRequest.of(
                                Math.max(0, page),
                                Math.min(size, 200),
                                Sort.by(Sort.Direction.DESC, "id")
                        )
                ));
            }
            if (search != null && !search.trim().isEmpty()) {
                return ApiResponse.success(personService.getPeoplePaginated(
                        search,
                       PageRequest.of(
                                0,
                                1000,
                                Sort.by(Sort.Direction.DESC, "id")
                        )
                ).getContent());
            }
            return ApiResponse.success(personService.getAllPeople());
        } catch (Exception e) {
            log.error("[PersonController] Lỗi getPeople: {}", e.getMessage(), e);
            return ApiResponse.error(500, "Lỗi nạp danh sách nhân sự: " + e.getMessage());
        }
    }

    @RequirePermission("FACE_VIEW")
    @GetMapping("/{id}")
    public ApiResponse<PersonDto> getPersonById(@PathVariable Long id) {
        PersonDto dto = personService.getPersonById(id);
        if (dto == null) {
            return ApiResponse.<PersonDto>builder()
                    .code(404)
                    .message("Không tìm thấy nhân sự có ID: " + id)
                    .build();
        }
        return ApiResponse.success(dto);
    }

    @RequirePermission("FACE_MANAGE")
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<PersonDto> registerPerson(
            @RequestParam("fullName") String fullName,
            @RequestParam("employeeCode") String employeeCode,
            @RequestParam(value = "department", required = false) String department,
            @RequestParam(value = "role", required = false) String role,
            @RequestParam(value = "images", required = false) List<MultipartFile> images,
            @RequestParam(value = "angles", required = false) List<String> angles,
            @RequestParam(value = "primaryIndex", required = false, defaultValue = "0") Integer primaryIndex
    ) {
        log.info("[PersonController] Tiếp nhận đăng ký nhân sự: {} ({}), ảnh: {}", fullName, employeeCode, images != null ? images.size() : 0);
        PersonDto created = personService.registerPerson(fullName, employeeCode, department, role, images, angles, primaryIndex);
        return ApiResponse.success(created);
    }

    @RequirePermission("FACE_MANAGE")
    @PostMapping(value = "/bulk-zip", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<Map<String, Object>> bulkImportFromZip(
            @RequestParam("file") MultipartFile file
    ) {
        log.info("[PersonController] Tiếp nhận file Zip nhập hàng loạt: {}", file.getOriginalFilename());
        Map<String, Object> result = personService.bulkImportFromZip(file);
        return ApiResponse.success(result);
    }

    @RequirePermission("FACE_MANAGE")
    @PutMapping("/{id}")
    public ApiResponse<PersonDto> updatePerson(
            @PathVariable Long id,
            @RequestParam("fullName") String fullName,
            @RequestParam("employeeCode") String employeeCode,
            @RequestParam(value = "department", required = false) String department,
            @RequestParam(value = "role", required = false) String role,
            @RequestParam(value = "status", required = false, defaultValue = "ACTIVE") String status
    ) {
        PersonDto updated = personService.updatePerson(id, fullName, employeeCode, department, role, status);
        return ApiResponse.success(updated);
    }

    @RequirePermission("FACE_MANAGE")
    @DeleteMapping("/{id}")
    public ApiResponse<Void> deletePerson(@PathVariable Long id) {
        personService.deletePerson(id);
        return ApiResponse.success(null);
    }

    @RequirePermission("FACE_VIEW")
    @GetMapping("/images/{personId}/{filename:.+}")
    public ResponseEntity<Resource> serveFaceImage(
            @PathVariable Long personId,
            @PathVariable String filename
    ) {
        String subPath = personId + "/" + filename;
        Resource file = personService.loadFaceImage(subPath);
        if (file == null || !file.exists()) {
            return ResponseEntity.notFound().build();
        }

        MediaType mediaType = MediaType.IMAGE_JPEG;
        if (filename.toLowerCase().endsWith(".png")) {
            mediaType = MediaType.IMAGE_PNG;
        }

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + file.getFilename() + "\"")
                .contentType(mediaType)
                .body(file);
    }
}
