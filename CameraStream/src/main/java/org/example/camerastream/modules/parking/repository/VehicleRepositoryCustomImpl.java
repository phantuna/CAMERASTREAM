package org.example.camerastream.modules.parking.repository;

import com.querydsl.core.BooleanBuilder;
import com.querydsl.jpa.impl.JPAQuery;
import com.querydsl.jpa.impl.JPAQueryFactory;
import lombok.RequiredArgsConstructor;
import org.example.camerastream.modules.parking.dto.VehicleFilterQuery;
import org.example.camerastream.modules.parking.entity.QCompany;
import org.example.camerastream.modules.parking.entity.QDepartment;
import org.example.camerastream.modules.parking.entity.QVehicle;
import org.example.camerastream.modules.parking.entity.Vehicle;
import org.example.camerastream.modules.parking.entity.VehicleType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
@RequiredArgsConstructor
public class VehicleRepositoryCustomImpl implements VehicleRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<Vehicle> searchVehiclesQueryDsl(VehicleFilterQuery filterQuery, Pageable pageable) {
        QVehicle vehicle = QVehicle.vehicle;
        QCompany company = QCompany.company;
        QDepartment department = QDepartment.department;

        BooleanBuilder builder = new BooleanBuilder();
        builder.and(vehicle.active.isTrue());

        if (filterQuery != null) {
            if (filterQuery.getSearch() != null && !filterQuery.getSearch().trim().isEmpty()) {
                String kw = filterQuery.getSearch().trim().toLowerCase();
                builder.and(
                    vehicle.plateNumber.toLowerCase().contains(kw)
                        .or(vehicle.ownerName.toLowerCase().contains(kw))
                        .or(vehicle.phoneNumber.toLowerCase().contains(kw))
                        .or(vehicle.cardCode.toLowerCase().contains(kw))
                );
            }

            if (filterQuery.getVehicleType() != null && !filterQuery.getVehicleType().trim().isEmpty() && !"ALL".equalsIgnoreCase(filterQuery.getVehicleType())) {
                try {
                    VehicleType vt = VehicleType.valueOf(filterQuery.getVehicleType().trim().toUpperCase());
                    builder.and(vehicle.vehicleType.eq(vt));
                } catch (Exception ignored) {}
            }

            if (filterQuery.getCompanyId() != null) {
                builder.and(vehicle.company.id.eq(filterQuery.getCompanyId()));
            }

            if (filterQuery.getDepartmentId() != null) {
                builder.and(vehicle.department.id.eq(filterQuery.getDepartmentId()));
            }

            if (filterQuery.getWhitelist() != null) {
                builder.and(vehicle.whitelist.eq(filterQuery.getWhitelist()));
            }
        }

        // Triệt tiêu lỗi N+1 Query: fetchJoin các bảng quan hệ
        JPAQuery<Vehicle> query = queryFactory
                .selectFrom(vehicle)
                .leftJoin(vehicle.company, company).fetchJoin()
                .leftJoin(vehicle.department, department).fetchJoin()
                .where(builder)
                .orderBy(vehicle.id.desc());

        if (pageable.isPaged()) {
            query.offset(pageable.getOffset()).limit(pageable.getPageSize());
        }

        List<Vehicle> content = query.fetch();

        Long totalCount = queryFactory
                .select(vehicle.count())
                .from(vehicle)
                .where(builder)
                .fetchOne();

        long total = totalCount != null ? totalCount : 0L;
        return new PageImpl<>(content, pageable, total);
    }
}

