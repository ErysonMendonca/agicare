-- agicare — migration 0091: adicionar whatsapp no enum notification_channel
alter type public.notification_channel add value if not exists 'whatsapp';
