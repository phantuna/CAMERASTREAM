package org.example.camerastream.modules.auth.entity;

import jakarta.persistence.*;
import lombok.*;
import org.example.camerastream.common.entity.base;

import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "roles")
@Data
@EqualsAndHashCode(callSuper = true)
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Role extends base {

    @Column(name = "name", nullable = false, unique = true, length = 50)
    private String name;

    /** Tên hiển thị (FE "Tên Nhóm Quyền"). V15 thêm; null với data cũ. */
    @Column(name = "display_name", length = 255)
    private String displayName;

    @Column(name = "description")
    private String description;

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
        name = "role_permissions",
        joinColumns = @JoinColumn(name = "role_id"),
        inverseJoinColumns = @JoinColumn(name = "permission_id")
    )
    @Builder.Default
    private Set<Permission> permissions = new HashSet<>();
}
