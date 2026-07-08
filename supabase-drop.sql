-- Run this FIRST to drop everything, then run supabase-schema.sql
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists handle_new_user();
drop table if exists chat_messages cascade;
drop table if exists workout_sets cascade;
drop table if exists workout_sessions cascade;
drop table if exists body_weight cascade;
drop table if exists user_profiles cascade;
drop table if exists exercises cascade;
