begin;

alter table public.flow_sesiones_temporales
  drop constraint if exists flow_sesiones_temporales_estado_check;

alter table public.flow_sesiones_temporales
  add constraint flow_sesiones_temporales_estado_check
  check (estado in (
    'identificando',
    'eligiendo_especialidad',
    'eligiendo_slot',
    'confirmando',
    'procesando_asignacion',
    'completado',
    'fallido',
    'cancelacion_solicitada',
    'cancelacion_procesando',
    'cancelada',
    'cancelacion_fallida',
    'reagendamiento_seleccionando_cita',
    'reagendamiento_eligiendo_slot',
    'reagendamiento_confirmando',
    'reagendamiento_asignando',
    'reagendamiento_cancelando_original',
    'reagendamiento_completado',
    'reagendamiento_revision_manual',
    'reagendamiento_fallido'
  ));

commit;
