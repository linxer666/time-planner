-- 增量迁移脚本（已建过旧版数据库时执行）
-- 可重复执行，不会破坏已有数据

create extension if not exists "uuid-ossp";

-- milestones 里程碑结果
alter table milestones add column if not exists result_note text default '';

-- courses 看课截止日期
alter table courses add column if not exists deadline_date date;

-- study_records 二级题型
alter table study_records add column if not exists question_category text default '';
alter table study_records add column if not exists question_subtype text default '';

-- user_settings 广东选调倒计时
alter table user_settings add column if not exists xuandiao_exam_date date;

-- exam_events 考试类型扩展
alter table exam_events drop constraint if exists exam_events_exam_type_check;
alter table exam_events add constraint exam_events_exam_type_check
  check (exam_type in ('guokao', 'guangdong', 'xuandiao'));
