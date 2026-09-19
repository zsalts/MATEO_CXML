// Configuración de la nube (Supabase Storage).
//
// Pegá acá los dos valores de tu proyecto: Supabase → Project Settings → API.
// La clave es SIEMPRE la anon / publishable. Nunca la service_role: esta queda
// a la vista de cualquiera que mire el código de la página, y la service_role
// da acceso total al proyecto.
//
// Con la url vacía la app funciona exactamente como antes y no sube nada.
//
// Este mismo archivo lo usan index.html y descargas.html, así que se configura
// una sola vez.
window.NUBE = {
    url:     'https://rljwrjivgrshzikevzyz.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsandyaml2Z3JzaHppa2V2enl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NTUxOTUsImV4cCI6MjEwNDUzMTE5NX0.bq576BOn04vDXPJsvGIPDY92x5ee0B9Q9mBsSwwds14',
    bucket:  'codificaciones'    // el bucket que creaste en Storage
};
