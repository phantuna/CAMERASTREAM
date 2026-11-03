package org.example.camerastream.modules.auth.entity;

import jakarta.persistence.*;
import lombok.*;
import org.example.camerastream.common.entity.base;

@Entity
@Table(name = "permissions")
@Data
@EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Permission extends base {

    @Column(name = "code", nullable = false, unique = true, length = 100)
    private String code;

    @Column(name = "name", nullable = false, length = 255)
    private String name;

    @Column(name = "group_name", nullable = false, length = 100)
    private String groupName;

    @Column(name = "description", length = 255)
    private String description;
}
