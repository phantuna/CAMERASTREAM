package org.example.camerastream.modules.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

public class AuthDtos {

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class LoginRequest {
        private String username;
        private String password;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class LoginResponse {
        private String token;
        private UserDto user;
        private List<String> permissions;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class UserDto {
        private Long id;
        private String username;
        private String fullName;
        private String email;
        private String phone;
        private String role;
        private String roleName;
        private List<String> permissions;
        private Boolean active;
        private String lastLoginAt;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class RoleDto {
        private Long id;
        private String code;
        private String name;
        private String description;
        private List<String> permissions;
        private Boolean active;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class PermissionDto {
        private Long id;
        private String code;
        private String name;
        private String groupName;
        private String description;
    }
}
