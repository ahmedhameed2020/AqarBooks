drop table if exists accsys_stage.je cascade;
drop table if exists accsys_stage.jel cascade;
drop table if exists accsys_stage.due cascade;
drop table if exists accsys_stage.pay cascade;
drop table if exists accsys_stage.alloc cascade;

create table accsys_stage.je  (seq bigint primary key, edate text, src text, glno text, descr text);
create table accsys_stage.jel (seq bigint, acc_code text, amt numeric(18,2));
create index ix_stage_jel_seq on accsys_stage.jel(seq);;
