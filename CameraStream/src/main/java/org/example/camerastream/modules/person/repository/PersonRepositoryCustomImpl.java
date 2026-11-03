package org.example.camerastream.modules.person.repository;

import com.querydsl.core.BooleanBuilder;
import com.querydsl.jpa.impl.JPAQuery;
import com.querydsl.jpa.impl.JPAQueryFactory;
import lombok.RequiredArgsConstructor;
import org.example.camerastream.modules.person.entity.Person;
import org.example.camerastream.modules.person.entity.QPerson;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
@RequiredArgsConstructor
public class PersonRepositoryCustomImpl implements PersonRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<Person> searchPeopleQueryDsl(
            String search,
            String department,
            String status,
            Pageable pageable
    ) {
        QPerson person = QPerson.person;
        BooleanBuilder builder = new BooleanBuilder();

        builder.and(person.active.isTrue());

        if (search != null && !search.trim().isEmpty()) {
            String kw = search.trim().toLowerCase();
            builder.and(
                person.fullName.toLowerCase().contains(kw)
                    .or(person.employeeCode.toLowerCase().contains(kw))
                    .or(person.department.toLowerCase().contains(kw))
                    .or(person.role.toLowerCase().contains(kw))
            );
        }

        if (department != null && !department.trim().isEmpty() && !"ALL".equalsIgnoreCase(department)) {
            builder.and(person.department.equalsIgnoreCase(department.trim()));
        }

        if (status != null && !status.trim().isEmpty() && !"ALL".equalsIgnoreCase(status)) {
            builder.and(person.status.equalsIgnoreCase(status.trim()));
        }

        JPAQuery<Person> query = queryFactory
                .selectFrom(person)
                .where(builder)
                .orderBy(person.id.desc());

        if (pageable.isPaged()) {
            query.offset(pageable.getOffset()).limit(pageable.getPageSize());
        }

        List<Person> content = query.fetch();

        Long totalCount = queryFactory
                .select(person.count())
                .from(person)
                .where(builder)
                .fetchOne();

        long total = totalCount != null ? totalCount : 0L;

        return new PageImpl<>(content, pageable, total);
    }
}
