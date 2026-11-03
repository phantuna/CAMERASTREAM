package org.example.camerastream.modules.person.repository;

import org.example.camerastream.modules.person.entity.PersonFaceImage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PersonFaceImageRepository extends JpaRepository<PersonFaceImage, Long> {
    List<PersonFaceImage> findByPersonId(Long personId);
}
