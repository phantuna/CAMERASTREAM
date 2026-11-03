# Stage 1: Build Application with Maven
FROM maven:3.9.6-eclipse-temurin-17-alpine AS builder
WORKDIR /build

# Cache dependencies
COPY pom.xml .
RUN mvn dependency:go-offline -B

# Build application JAR
COPY src ./src
RUN mvn clean package -DskipTests -B

# Stage 2: Minimal Production JRE Runtime
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

RUN apk add --no-cache curl tzdata
ENV TZ=Asia/Ho_Chi_Minh

# Copy JAR from builder stage
COPY --from=builder /build/target/*.jar app.jar

# Tạo các thư mục lưu trữ mặc định
RUN mkdir -p /data/snapshots /data/backup

EXPOSE 8080

ENTRYPOINT ["java", "-Djava.security.egd=file:/dev/./urandom", "-Dfile.encoding=UTF-8", "-jar", "app.jar"]
