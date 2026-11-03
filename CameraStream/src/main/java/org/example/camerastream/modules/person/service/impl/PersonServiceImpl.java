package org.example.camerastream.modules.person.service.impl;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.camerastream.modules.person.dto.PersonDto;
import org.example.camerastream.modules.person.dto.PersonImageDto;
import org.example.camerastream.modules.person.entity.Person;
import org.example.camerastream.modules.person.entity.PersonFaceImage;
import org.example.camerastream.modules.person.repository.PersonFaceImageRepository;
import org.example.camerastream.modules.person.repository.PersonRepository;
import org.example.camerastream.modules.person.service.IPersonService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.MalformedURLException;
import java.nio.file.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@Service
@RequiredArgsConstructor
@Slf4j
public class PersonServiceImpl implements IPersonService {

    private final PersonRepository personRepository;
    private final PersonFaceImageRepository faceImageRepository;

    @Value("${face.storage.path:data/faces}")
    private String faceStorageDir;

    private Path rootStoragePath;

    @PostConstruct
    public void init() {
        try {
            rootStoragePath = Paths.get(faceStorageDir).toAbsolutePath().normalize();
            Files.createDirectories(rootStoragePath);
            log.info("[PersonService] Thư mục lưu trữ khuôn mặt: {}", rootStoragePath);
        } catch (IOException e) {
            log.error("[PersonService] Không thể tạo thư mục lưu trữ ảnh khuôn mặt: {}", e.getMessage());
        }
    }

    @Override
    @Transactional(readOnly = true)
    public List<PersonDto> getAllPeople() {
        try {
            return personRepository.findAll().stream()
                    .map(this::toDto)
                    .collect(Collectors.toList());
        } catch (Exception e) {
            log.error("[PersonService] Lỗi khi truy vấn danh sách nhân sự: {}", e.getMessage(), e);
            return Collections.emptyList();
        }
    }

    @Override
    @Transactional(readOnly = true)
    public Page<PersonDto> getPeoplePaginated(String search, Pageable pageable) {
        return getPeoplePaginated(search, null, null, pageable);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<PersonDto> getPeoplePaginated(String search, String department, String status, Pageable pageable) {
        try {
            String q = (search != null && !search.trim().isEmpty()) ? search.trim() : null;
            return personRepository.searchPeopleQueryDsl(q, department, status, pageable).map(this::toDto);
        } catch (Exception e) {
            log.error("[PersonService] Lỗi khi truy vấn phân trang QueryDSL nhân sự: {}", e.getMessage(), e);
            return Page.empty(pageable);
        }
    }

    @Override
    @Transactional(readOnly = true)
    public PersonDto getPersonById(Long id) {
        return personRepository.findById(id)
                .map(this::toDto)
                .orElse(null);
    }

    @Override
    @Transactional
    public PersonDto registerPerson(
            String fullName,
            String employeeCode,
            String department,
            String role,
            List<MultipartFile> imageFiles,
            List<String> angles,
            Integer primaryIndex
    ) {
        log.info("[PersonService] Đăng ký nhân sự mới: {} (Mã: {}), Số lượng ảnh: {}", fullName, employeeCode, imageFiles != null ? imageFiles.size() : 0);

        Optional<Person> existing = personRepository.findByEmployeeCode(employeeCode);
        Person person = existing.orElse(null);
        if (person == null) {
            person = Person.builder()
                    .fullName(fullName)
                    .employeeCode(employeeCode)
                    .department(department)
                    .role(role)
                    .status("ACTIVE")
                    .build();
        }

        person.setFullName(fullName);
        person.setDepartment(department);
        person.setRole(role);
        person = personRepository.save(person);

        int pIdx = (primaryIndex != null && primaryIndex >= 0) ? primaryIndex : 0;
        String firstUrl = null;

        if (imageFiles != null && !imageFiles.isEmpty()) {
            Path personDir = rootStoragePath.resolve(person.getId().toString());
            try {
                Files.createDirectories(personDir);
            } catch (IOException e) {
                log.error("[PersonService] Lỗi tạo thư mục nhân viên {}: {}", person.getId(), e.getMessage());
            }

            for (int i = 0; i < imageFiles.size(); i++) {
                MultipartFile file = imageFiles.get(i);
                if (file.isEmpty()) continue;

                String originalName = file.getOriginalFilename();
                String ext = ".jpg";
                if (originalName != null && originalName.contains(".")) {
                    ext = originalName.substring(originalName.lastIndexOf("."));
                }

                String filename = UUID.randomUUID().toString() + ext;
                Path destination = personDir.resolve(filename);

                try (InputStream inputStream = file.getInputStream()) {
                    Files.copy(inputStream, destination, StandardCopyOption.REPLACE_EXISTING);
                } catch (IOException e) {
                    log.error("[PersonService] Lỗi lưu ảnh {}: {}", filename, e.getMessage());
                    continue;
                }

                String relativeUrl = "/api/v1/people/images/" + person.getId() + "/" + filename;
                boolean isPrimary = (i == pIdx);
                if (isPrimary || firstUrl == null) {
                    firstUrl = relativeUrl;
                }

                String angle = "FRONTAL";
                if (angles != null && i < angles.size() && angles.get(i) != null) {
                    angle = angles.get(i);
                }

                PersonFaceImage faceImage = PersonFaceImage.builder()
                        .person(person)
                        .imageUrl(relativeUrl)
                        .storagePath(destination.toString())
                        .angle(angle)
                        .isPrimary(isPrimary)
                        .build();

                faceImageRepository.save(faceImage);
                person.getFaceImages().add(faceImage);
            }

            if (firstUrl != null) {
                person.setPrimaryPhotoUrl(firstUrl);
                personRepository.save(person);
            }
        }

        return toDto(person);
    }

    @Override
    @Transactional
    public void deletePerson(Long id) {
        personRepository.findById(id).ifPresent(p -> {
            Path personDir = rootStoragePath.resolve(id.toString());
            try {
                if (Files.exists(personDir)) {
                    Files.walk(personDir)
                            .sorted(Comparator.reverseOrder())
                            .forEach(path -> {
                                try { Files.deleteIfExists(path); } catch (IOException ignored) {}
                            });
                }
            } catch (IOException e) {
                log.warn("[PersonService] Không thể xóa thư mục ảnh nhân viên {}: {}", id, e.getMessage());
            }
            personRepository.delete(p);
        });
    }

    @Override
    @Transactional
    public PersonDto updatePerson(Long id, String fullName, String employeeCode, String department, String role, String status) {
        return personRepository.findById(id).map(p -> {
            if (fullName != null && !fullName.trim().isEmpty()) p.setFullName(fullName.trim());
            if (employeeCode != null && !employeeCode.trim().isEmpty()) p.setEmployeeCode(employeeCode.trim().toUpperCase());
            if (department != null) p.setDepartment(department);
            if (role != null) p.setRole(role);
            if (status != null) p.setStatus(status);
            return toDto(personRepository.save(p));
        }).orElse(null);
    }

    @Override
    public Resource loadFaceImage(String subPath) {
        try {
            Path filePath = rootStoragePath.resolve(subPath).normalize();
            Resource resource = new UrlResource(filePath.toUri());
            if (resource.exists() && resource.isReadable()) {
                return resource;
            }
        } catch (MalformedURLException ignored) {}
        return null;
    }

    @Override
    @Transactional
    public Map<String, Object> bulkImportFromZip(MultipartFile zipFile) {
        log.info("[PersonService] Bắt đầu giải nén và nhập hàng loạt từ file Zip: {}", zipFile.getOriginalFilename());
        int importedPeopleCount = 0;
        int totalImagesCount = 0;

        try (ZipInputStream zis = new ZipInputStream(zipFile.getInputStream())) {
            ZipEntry entry;
            Map<String, List<Map.Entry<String, byte[]>>> personPhotosMap = new LinkedHashMap<>();

            byte[] buffer = new byte[8192];
            while ((entry = zis.getNextEntry()) != null) {
                if (entry.isDirectory()) continue;
                String name = entry.getName().replace("\\", "/");
                String lower = name.toLowerCase();
                if (!lower.endsWith(".jpg") && !lower.endsWith(".jpeg") && !lower.endsWith(".png") && !lower.endsWith(".webp")) {
                    continue;
                }

                String[] parts = name.split("/");
                String personKey;
                String fileNameOnly;
                if (parts.length >= 2) {
                    personKey = parts[parts.length - 2];
                    fileNameOnly = parts[parts.length - 1];
                } else {
                    fileNameOnly = parts[0];
                    String baseName = fileNameOnly.substring(0, fileNameOnly.lastIndexOf('.'));
                    String cleaned = baseName.replaceAll("(?i)_(front|thang|chinh|left|trai|right|phai|0[1-9]|\\d+)$", "");
                    personKey = cleaned.isEmpty() ? baseName : cleaned;
                }

                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                int len;
                while ((len = zis.read(buffer)) > 0) {
                    baos.write(buffer, 0, len);
                }

                personPhotosMap.computeIfAbsent(personKey, k -> new ArrayList<>())
                        .add(new AbstractMap.SimpleEntry<>(fileNameOnly, baos.toByteArray()));
                totalImagesCount++;
            }

            for (Map.Entry<String, List<Map.Entry<String, byte[]>>> pEntry : personPhotosMap.entrySet()) {
                String personKey = pEntry.getKey();
                List<Map.Entry<String, byte[]>> photos = pEntry.getValue();
                if (photos.isEmpty()) continue;

                String code = personKey;
                String fullName = personKey.replace("_", " ");
                if (personKey.contains("_")) {
                    String[] segs = personKey.split("_", 2);
                    code = segs[0].trim();
                    fullName = segs[1].replace("_", " ").trim();
                } else if (personKey.contains("-")) {
                    String[] segs = personKey.split("-", 2);
                    code = segs[0].trim();
                    fullName = segs[1].replace("-", " ").trim();
                }

                Optional<Person> existingOpt = personRepository.findByEmployeeCode(code);
                Person person;
                if (existingOpt.isPresent()) {
                    person = existingOpt.get();
                } else {
                    person = Person.builder()
                            .fullName(fullName)
                            .employeeCode(code)
                            .department("Nhập Hàng Loạt")
                            .role("Nhân Viên")
                            .status("ACTIVE")
                            .build();
                }

                person = personRepository.save(person);
                Path personDir = rootStoragePath.resolve(person.getId().toString());
                Files.createDirectories(personDir);

                String primaryUrl = null;
                for (int i = 0; i < photos.size(); i++) {
                    Map.Entry<String, byte[]> photoItem = photos.get(i);
                    String fileNameOnly = photoItem.getKey();
                    byte[] bytes = photoItem.getValue();

                    String filename = UUID.randomUUID().toString() + ".jpg";
                    Path dest = personDir.resolve(filename);
                    Files.write(dest, bytes, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);

                    String relativeUrl = "/api/v1/people/images/" + person.getId() + "/" + filename;
                    boolean isPrimary = (i == 0);
                    if (isPrimary) {
                        primaryUrl = relativeUrl;
                    }

                    String lowerFileName = fileNameOnly.toLowerCase();
                    String angle = "OTHER";
                    if (lowerFileName.contains("front") || lowerFileName.contains("thang") || lowerFileName.contains("chinh") || i == 0) {
                        angle = "FRONTAL";
                    } else if (lowerFileName.contains("left") || lowerFileName.contains("trai")) {
                        angle = "LEFT_30";
                    } else if (lowerFileName.contains("right") || lowerFileName.contains("phai")) {
                        angle = "RIGHT_30";
                    }

                    PersonFaceImage pfi = PersonFaceImage.builder()
                            .person(person)
                            .imageUrl(relativeUrl)
                            .storagePath(dest.toString())
                            .angle(angle)
                            .isPrimary(isPrimary)
                            .build();

                    faceImageRepository.save(pfi);
                    person.getFaceImages().add(pfi);
                }

                if (primaryUrl != null) {
                    person.setPrimaryPhotoUrl(primaryUrl);
                    personRepository.save(person);
                }
                importedPeopleCount++;
            }
        } catch (Exception e) {
            log.error("[PersonService] Lỗi khi xử lý file Zip: {}", e.getMessage(), e);
            throw new RuntimeException("Lỗi giải nén ZIP: " + e.getMessage());
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("importedPeopleCount", importedPeopleCount);
        result.put("totalImagesCount", totalImagesCount);
        result.put("message", "Đã nhập thành công " + importedPeopleCount + " nhân sự với " + totalImagesCount + " ảnh mẫu AI.");
        return result;
    }

    private PersonDto toDto(Person person) {
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd");
        String regDate = person.getCreated_at() != null ? person.getCreated_at().format(formatter) : "2026-10-22";

        List<PersonImageDto> images = person.getFaceImages() != null ? person.getFaceImages().stream()
                .map(img -> PersonImageDto.builder()
                        .id(img.getId())
                        .imageUrl(img.getImageUrl())
                        .angle(img.getAngle())
                        .isPrimary(img.getIsPrimary())
                        .build())
                .collect(Collectors.toList()) : Collections.emptyList();

        return PersonDto.builder()
                .id(person.getId())
                .fullName(person.getFullName())
                .employeeCode(person.getEmployeeCode())
                .department(person.getDepartment())
                .role(person.getRole())
                .primaryPhotoUrl(person.getPrimaryPhotoUrl())
                .status(person.getStatus())
                .trainedPhotosCount(images.size())
                .registeredDate(regDate)
                .images(images)
                .build();
    }
}
