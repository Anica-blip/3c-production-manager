// 3C Production Manager — config
// Safe to be public: the Worker address, the Supabase project address and the
// Supabase anon key are all public values by design. Nothing secret lives in
// this file. Sign-in is GitHub through Supabase (project 3C Control Center),
// and the Worker only answers the owner.

const CONFIG = {
  apiBase: 'https://productionmanager.threadcommand.center/api',
  supabaseUrl: 'https://uqyqpwhkzlhqxcqajhkn.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxeXFwd2hremxocXhjcWFqaGtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2NzY3MDMsImV4cCI6MjA2NjI1MjcwM30.AE-bdpBIATQCtNWvWo468ZWPwQ-9LWghRO6-BeAzA2U',
};
