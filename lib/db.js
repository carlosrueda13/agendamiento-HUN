const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (url && key) {
  supabase = createClient(url, key, { auth: { persistSession: false } });
} else {
  console.warn(
    "⚠️ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no configuradas: la persistencia está deshabilitada."
  );
}

const ahora = () => new Date().toISOString();

// Crea o actualiza el paciente vinculado a un número de WhatsApp.
async function guardarPaciente(p) {
  if (!supabase) return;
  const { error } = await supabase.from("pacientes_whatsapp").upsert(
    {
      whatsapp_numero: p.whatsapp_numero,
      tipo_documento: p.tipo_documento,
      numero_documento: p.numero_documento,
      eps_codigo: p.eps_codigo,
      nombre_paciente: p.nombre_paciente,
      updated_at: ahora(),
    },
    { onConflict: "whatsapp_numero" }
  );
  if (error) console.error("Supabase guardarPaciente:", error.message);
}

async function getPaciente(whatsapp_numero) {
  if (!supabase) return null;
  const { data } = await supabase
    .from("pacientes_whatsapp")
    .select("*")
    .eq("whatsapp_numero", whatsapp_numero)
    .maybeSingle();
  return data;
}

// Crea o actualiza la sesión (estado del Flow) de un número.
async function guardarSesion(s) {
  if (!supabase) return;
  const { error } = await supabase.from("sesiones").upsert(
    {
      whatsapp_numero: s.whatsapp_numero,
      estado: s.estado,
      especialidad_codigo: s.especialidad_codigo,
      especialidad_nombre: s.especialidad_nombre,
      slot_seleccionado: s.slot_seleccionado,
      updated_at: ahora(),
    },
    { onConflict: "whatsapp_numero" }
  );
  if (error) console.error("Supabase guardarSesion:", error.message);
}

async function getSesion(whatsapp_numero) {
  if (!supabase) return null;
  const { data } = await supabase
    .from("sesiones")
    .select("*")
    .eq("whatsapp_numero", whatsapp_numero)
    .maybeSingle();
  return data;
}

// Registra una cita agendada en el historial.
async function guardarCita(c) {
  if (!supabase) return;
  const { error } = await supabase.from("citas_agendadas").insert(c);
  if (error) console.error("Supabase guardarCita:", error.message);
}

module.exports = {
  supabase,
  guardarPaciente,
  getPaciente,
  guardarSesion,
  getSesion,
  guardarCita,
};
