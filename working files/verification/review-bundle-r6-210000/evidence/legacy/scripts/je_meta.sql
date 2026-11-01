select column_name||' '||data_type||' default='||coalesce(column_default,'-') from information_schema.columns where table_name='journal_entries' and is_nullable='NO' order by ordinal_position;
select conname||' '||pg_get_constraintdef(oid) from pg_constraint where conrelid='public.journal_entries'::regclass and contype='c';
select conname||' '||pg_get_constraintdef(oid) from pg_constraint where conrelid='public.journal_entry_lines'::regclass and contype='c';
