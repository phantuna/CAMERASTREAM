package org.example.camerastream.modules.person.entity;

import jakarta.persistence.*;
import lombok.*;
import org.example.camerastream.common.entity.base;

@Entity
@Table(name = "person_face_images")
@Data
@EqualsAndHashCode(callSuper = true, exclude = {"person"})
@ToString(exclude = {"person"})
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PersonFaceImage extends base {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "person_id", nullable = false)
    private Person person;

    @Column(name = "image_url", nullable = false)
    private String imageUrl;

    @Column(name = "storage_path")
    private String storagePath;

    @Builder.Default
    @Column(name = "angle")
    private String angle = "FRONTAL"; // FRONTAL, LEFT_30, RIGHT_30, OTHER

    @Builder.Default
    @Column(name = "is_primary")
    private Boolean isPrimary = false;

    @Column(name = "embedding_vector", columnDefinition = "TEXT")
    private String embeddingVector; // 512-dim embedding serialized JSON / vector
}
