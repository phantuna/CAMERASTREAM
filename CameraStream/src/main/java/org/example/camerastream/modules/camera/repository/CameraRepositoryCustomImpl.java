package org.example.camerastream.modules.camera.repository;

import com.querydsl.core.BooleanBuilder;
import com.querydsl.jpa.impl.JPAQuery;
import com.querydsl.jpa.impl.JPAQueryFactory;
import lombok.RequiredArgsConstructor;
import org.example.camerastream.modules.camera.entity.Camera;
import org.example.camerastream.modules.camera.entity.QCamera;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
@RequiredArgsConstructor
public class CameraRepositoryCustomImpl implements CameraRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public List<Camera> searchActive(String keyword) {
        QCamera camera = QCamera.camera;
        BooleanBuilder builder = new BooleanBuilder();

        // Chỉ tìm các camera chưa bị soft-delete
        builder.and(camera.deleted_at.isNull());

        if (keyword != null && !keyword.trim().isEmpty()) {
            String kw = keyword.trim().toLowerCase();
            builder.and(
                camera.name.toLowerCase().contains(kw)
                    .or(camera.ipAddress.toLowerCase().contains(kw))
                    .or(camera.streamPath.toLowerCase().contains(kw))
                    .or(camera.location.toLowerCase().contains(kw))
            );
        }

        return queryFactory
                .selectFrom(camera)
                .where(builder)
                .orderBy(camera.created_at.desc())
                .fetch();
    }

    @Override
    public Page<Camera> searchActivePaginated(String keyword, Pageable pageable) {
        QCamera camera = QCamera.camera;
        BooleanBuilder builder = new BooleanBuilder();

        builder.and(camera.deleted_at.isNull());

        if (keyword != null && !keyword.trim().isEmpty()) {
            String kw = keyword.trim().toLowerCase();
            builder.and(
                camera.name.toLowerCase().contains(kw)
                    .or(camera.ipAddress.toLowerCase().contains(kw))
                    .or(camera.streamPath.toLowerCase().contains(kw))
                    .or(camera.location.toLowerCase().contains(kw))
            );
        }

        JPAQuery<Camera> query = queryFactory
                .selectFrom(camera)
                .where(builder)
                .orderBy(camera.created_at.desc());

        if (pageable.isPaged()) {
            query.offset(pageable.getOffset()).limit(pageable.getPageSize());
        }

        List<Camera> content = query.fetch();
        Long total = queryFactory
                .select(camera.count())
                .from(camera)
                .where(builder)
                .fetchOne();

        return new PageImpl<>(content, pageable, total != null ? total : 0L);
    }
}
