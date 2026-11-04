package org.example.camerastream.modules.parking.repository;

import com.querydsl.core.BooleanBuilder;
import com.querydsl.jpa.impl.JPAQuery;
import com.querydsl.jpa.impl.JPAQueryFactory;
import lombok.RequiredArgsConstructor;
import org.example.camerastream.modules.parking.dto.ParkingSessionFilterQuery;
import org.example.camerastream.modules.parking.entity.ParkingSession;
import org.example.camerastream.modules.parking.entity.ParkingSessionStatus;
import org.example.camerastream.modules.parking.entity.QLane;
import org.example.camerastream.modules.parking.entity.QParkingSession;
import org.example.camerastream.modules.parking.entity.VehicleType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
@RequiredArgsConstructor
public class ParkingSessionRepositoryCustomImpl implements ParkingSessionRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<ParkingSession> searchSessionsQueryDsl(ParkingSessionFilterQuery filterQuery, Pageable pageable) {
        QParkingSession session = QParkingSession.parkingSession;
        QLane inLane = new QLane("inLane");
        QLane outLane = new QLane("outLane");

        BooleanBuilder builder = new BooleanBuilder();
        builder.and(session.active.isTrue());

        if (filterQuery != null) {
            // 1. Tìm kiếm tổng hợp (Search Keyword)
            if (filterQuery.getSearch() != null && !filterQuery.getSearch().trim().isEmpty()) {
                String kw = filterQuery.getSearch().trim().toLowerCase();
                builder.and(
                    session.plateNumber.toLowerCase().contains(kw)
                        .or(session.personName.toLowerCase().contains(kw))
                        .or(session.companyName.toLowerCase().contains(kw))
                        .or(session.departmentName.toLowerCase().contains(kw))
                        .or(session.cardCode.toLowerCase().contains(kw))
                );
            }

            // 2. Lọc theo Biển số xe cụ thể
            if (filterQuery.getPlateNumber() != null && !filterQuery.getPlateNumber().trim().isEmpty()) {
                builder.and(session.plateNumber.toLowerCase().contains(filterQuery.getPlateNumber().trim().toLowerCase()));
            }

            // 3. Lọc theo Loại xe
            if (filterQuery.getVehicleType() != null && !filterQuery.getVehicleType().trim().isEmpty() && !"ALL".equalsIgnoreCase(filterQuery.getVehicleType())) {
                try {
                    VehicleType vt = VehicleType.valueOf(filterQuery.getVehicleType().trim().toUpperCase());
                    builder.and(session.vehicleType.eq(vt));
                } catch (Exception ignored) {}
            }

            // 4. Lọc theo Trạng thái phiên đỗ xe
            if (filterQuery.getStatus() != null && !filterQuery.getStatus().trim().isEmpty() && !"ALL".equalsIgnoreCase(filterQuery.getStatus())) {
                try {
                    ParkingSessionStatus st = ParkingSessionStatus.valueOf(filterQuery.getStatus().trim().toUpperCase());
                    builder.and(session.status.eq(st));
                } catch (Exception ignored) {}
            }

            // 5. Lọc theo Tên làn xe
            if (filterQuery.getLaneName() != null && !filterQuery.getLaneName().trim().isEmpty() && !"ALL".equalsIgnoreCase(filterQuery.getLaneName())) {
                String ln = filterQuery.getLaneName().trim().toLowerCase();
                builder.and(
                    session.inLaneName.toLowerCase().contains(ln)
                        .or(session.outLaneName.toLowerCase().contains(ln))
                );
            }

            // 6. Lọc theo Khoảng thời gian (fromDate - toDate)
            if (filterQuery.getFromDate() != null) {
                builder.and(
                    session.inTime.goe(filterQuery.getFromDate())
                        .or(session.outTime.goe(filterQuery.getFromDate()))
                );
            }
            if (filterQuery.getToDate() != null) {
                builder.and(
                    session.inTime.loe(filterQuery.getToDate())
                        .or(session.outTime.loe(filterQuery.getToDate()))
                );
            }
        }

        // Triệt tiêu lỗi N+1 Query: fetchJoin các làn vào và làn ra
        JPAQuery<ParkingSession> query = queryFactory
                .selectFrom(session)
                .leftJoin(session.inLane, inLane).fetchJoin()
                .leftJoin(session.outLane, outLane).fetchJoin()
                .where(builder)
                .orderBy(session.id.desc());

        if (pageable.isPaged()) {
            query.offset(pageable.getOffset()).limit(pageable.getPageSize());
        }

        List<ParkingSession> content = query.fetch();

        Long totalCount = queryFactory
                .select(session.count())
                .from(session)
                .where(builder)
                .fetchOne();

        long total = totalCount != null ? totalCount : 0L;
        return new PageImpl<>(content, pageable, total);
    }
}

