-- Configuración de la nube de Tag & View.
-- Pegalo entero en Supabase → SQL Editor → Run. Es lo mismo que hacer el
-- bucket y las políticas a mano en el panel, pero de una sola vez.
--
-- Falta una cosa que no conviene hacer por SQL: crear el usuario.
-- Eso va en Authentication → Users → Add user, con tu correo y contraseña.

-- ── El bucket ──
-- public = false a propósito: los XML no tienen que ser legibles por cualquiera
-- que adivine la URL. Quien los protege es el login, no el secreto del nombre.
insert into storage.buckets (id, name, public)
values ('codificaciones', 'codificaciones', false)
on conflict (id) do nothing;

-- ── Las políticas ──
-- Sin esto, Storage rechaza todo con 403, incluso estando logueado: en Supabase
-- storage.objects tiene RLS activo de fábrica y lo que no está permitido, no va.
-- Todas piden `authenticated`, así que la clave anon suelta no abre nada.

-- Subir un XML nuevo (el iPad).
drop policy if exists "tagview sube" on storage.objects;
create policy "tagview sube"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'codificaciones');

-- Listar y descargar (descargas.html, desde la compu).
drop policy if exists "tagview lee" on storage.objects;
create policy "tagview lee"
    on storage.objects for select to authenticated
    using (bucket_id = 'codificaciones');

-- Pisar un archivo que ya existe. Hace falta porque la app sube con
-- `x-upsert: true`: re-exportar el mismo partido lo reemplaza en vez de
-- acumular copias. Sin esta política, la segunda subida del mismo nombre falla.
drop policy if exists "tagview pisa" on storage.objects;
create policy "tagview pisa"
    on storage.objects for update to authenticated
    using (bucket_id = 'codificaciones')
    with check (bucket_id = 'codificaciones');

-- Borrar queda afuera a propósito: la app no borra nada, y una política de
-- menos es una forma menos de perder un partido por accidente. Si algún día
-- querés borrar desde la web, se agrega igual que las de arriba con `for delete`.
