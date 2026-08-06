-- Ejecuta este script completo en Supabase: panel del proyecto -> SQL Editor -> New query -> pega esto -> Run.

-- Habilita la funcion que genera identificadores unicos (UUID) automaticamente.
create extension if not exists pgcrypto;

-- Cada fila = un documento/imagen original que subiste a la app antes de repartirlo.
create table if not exists archivos_originales (
    id uuid primary key default gen_random_uuid(),
    nombre text not null,
    fecha timestamptz not null default now()
);

-- Cada fila = una copia concreta que se marco y se entrego a una persona.
-- id_unico_marca es el mismo ID_Usuario que se escondio dentro de la imagen,
-- asi que si esa copia se filtra, puedes buscarlo aqui para saber a quien se le dio.
create table if not exists copias_distribuidas (
    id uuid primary key default gen_random_uuid(),
    archivo_id uuid references archivos_originales(id) on delete set null,
    nombre_destinatario text not null,
    email_destinatario text not null,
    id_unico_marca text not null,
    fecha_envio timestamptz not null default now()
);

-- Indices para poder buscar rapido por marca (el caso de uso principal: "encontre
-- esta marca en una imagen filtrada, ¿de quien es?") y por archivo original.
create index if not exists idx_copias_distribuidas_id_unico_marca on copias_distribuidas (id_unico_marca);
create index if not exists idx_copias_distribuidas_archivo_id on copias_distribuidas (archivo_id);

-- Activa la seguridad a nivel de fila y NO se crea ninguna politica de acceso.
-- Resultado: nadie puede leer ni escribir estas tablas usando la clave publica
-- "anon" (la que usaria el frontend). Solo el backend, que se conecta con la
-- clave secreta "service_role", puede acceder. Esto es importante porque estas
-- tablas contienen nombres y emails de personas.
alter table archivos_originales enable row level security;
alter table copias_distribuidas enable row level security;
