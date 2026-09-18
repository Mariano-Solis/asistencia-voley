const TRAINING_URL = "https://voleiboles.lovable.app/";

export default function ProfessorTrainingHub() {
  return (
    <section className="training-hub-section">
      <div className="page-title">
        <div>
          <h1>Entrenamiento</h1>
          <p>Material De Consulta y Apoyo Para Profes.</p>
        </div>
      </div>

      <div className="card training-resource-card">
        <div className="training-resource-icon">🏐</div>
        <div className="grow">
          <span className="eyebrow">Biblioteca Externa</span>
          <h2>+1000 Dinámicas De Voleibol</h2>
          <p>Acceso Directo Al Material De Entrenamiento, Ejercicios, Dinámicas, Planificación y Recursos Para La Cancha.</p>
        </div>
        <a className="training-resource-link" href={TRAINING_URL} target="_blank" rel="noreferrer">Abrir Material ↗</a>
      </div>

      <div className="card training-library-ready">
        <div>
          <h2>Biblioteca Del Profe</h2>
          <p>Sección Para PDFs, Planificaciones y Otros Materiales De Entrenamiento.</p>
        </div>
        <span className="training-coming-soon">Material De Entrenamiento</span>
      </div>
    </section>
  );
}
