drop table if exists accsys_stage.coa cascade;
create table accsys_stage.coa (code text primary key, parent_code text, name_ar text, name_en text, lvl int);;
