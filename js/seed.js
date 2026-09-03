// Pure seed data: no DOM, no Firebase. Transcribed from the owner's real
// training programs (Aug/2026). Muscle assignments are sensible defaults
// and stay fully editable in the app.
//
// Ids derived from this data (see db.js seeders):
//   muscle  -> mus-<key>          exercise -> ex-<slug>
//   program -> prog-<slug>        day      -> day-<progSlug>-<daySlug>

export const DEFAULT_MUSCLES = [
  { key: "peito", name: "Peito" },
  { key: "costas", name: "Costas" },
  { key: "ombros", name: "Ombros" },
  { key: "biceps", name: "Bíceps" },
  { key: "triceps", name: "Tríceps" },
  { key: "antebraco", name: "Antebraço" },
  { key: "quadriceps", name: "Quadríceps" },
  { key: "posterior", name: "Posterior de coxa" },
  { key: "gluteos", name: "Glúteos" },
  { key: "panturrilha", name: "Panturrilha" },
  { key: "abdomen", name: "Abdômen" },
  { key: "lombar", name: "Lombar" },
  { key: "trapezio", name: "Trapézio" },
  { key: "adutores", name: "Adutores/Abdutores" },
];

export const DEFAULT_CARDIO_TYPES = [
  { key: "bike", name: "Bike" },
  { key: "eliptico", name: "Elíptico" },
  { key: "esteira", name: "Esteira" },
  { key: "escada", name: "Escada" },
  { key: "corrida", name: "Corrida" },
  { key: "remo", name: "Remo" },
  { key: "outro", name: "Outro" },
];

// primary/secondary/others use the muscle keys above.
export const SEED_EXERCISES = [
  {
    slug: "supino_maquina",
    name: "Supino máquina",
    refWeight: "30 kg",
    note: "Ajuste: banco pós. 5 (check); anotação anterior pós. 6–7 (confirmar)",
    primary: "peito", secondary: ["triceps"], others: ["ombros"],
  },
  {
    slug: "supino_inclinado_halteres",
    name: "Supino inclinado com halteres",
    refWeight: "12 kg cada",
    note: "",
    primary: "peito", secondary: ["ombros"], others: ["triceps"],
  },
  {
    slug: "crucifixo_maquina",
    name: "Crucifixo máquina",
    refWeight: "40–42,5 kg",
    note: "Ajuste: banco pós. 6–7",
    primary: "peito", secondary: [], others: ["ombros"],
  },
  {
    slug: "desenvolvimento_ombros_maquina",
    name: "Desenvolvimento de ombros máquina",
    refWeight: "12,5 kg",
    note: "Ajuste: banco pós. 6–7; cotovelos não muito abertos; anotação anterior também indica 6 kg cada com halteres",
    primary: "ombros", secondary: ["triceps"], others: ["trapezio"],
  },
  {
    slug: "elevacao_lateral_unilateral_polia",
    name: "Elevação lateral unilateral na polia",
    refWeight: "2,5 kg",
    note: "Alternativa na máquina: 20 kg; pós. 3; amplitude 3",
    primary: "ombros", secondary: [], others: ["trapezio"],
  },
  {
    slug: "triceps_pushdown",
    name: "Tríceps pushdown",
    refWeight: "20 kg",
    note: "",
    primary: "triceps", secondary: [], others: ["antebraco"],
  },
  {
    slug: "triceps_frances_unilateral_halter",
    name: "Tríceps francês unilateral com halter",
    refWeight: "5–6 kg",
    note: "",
    primary: "triceps", secondary: [], others: [],
  },
  {
    slug: "triceps_testa_polia",
    name: "Tríceps testa na polia com barra reta",
    refWeight: "12,5 kg",
    note: "",
    primary: "triceps", secondary: [], others: [],
  },
  {
    slug: "puxada_alta_maquina",
    name: "Puxada alta máquina",
    refWeight: "40–42,5 kg",
    note: "Ajuste: máquina 82; banco pós. 6; usar strap consistentemente se necessário",
    primary: "costas", secondary: ["biceps"], others: ["antebraco"],
  },
  {
    slug: "remada_fechada_unilateral_maquina",
    name: "Remada fechada unilateral máquina",
    refWeight: "20 kg por braço",
    note: "Ajuste: length 7; pós. 5",
    primary: "costas", secondary: ["biceps"], others: ["antebraco"],
  },
  {
    slug: "remada_alta_articulada_maquina",
    name: "Remada alta articulada máquina",
    refWeight: "25 kg cada lado",
    note: "Ajuste: pós. 6",
    primary: "costas", secondary: ["biceps"], others: ["trapezio", "ombros"],
  },
  {
    slug: "face_pull",
    name: "Face pull",
    refWeight: "15–17,5 kg",
    note: "Ajuste: puxar na altura do rosto",
    primary: "ombros", secondary: ["trapezio"], others: ["costas"],
  },
  {
    slug: "biceps_maquina",
    name: "Bíceps máquina",
    refWeight: "20 kg",
    note: "Ajuste: pós. 6–7 (confirmar)",
    primary: "biceps", secondary: [], others: ["antebraco"],
  },
  {
    slug: "biceps_scott_unilateral_halter",
    name: "Bíceps Scott unilateral com halter",
    refWeight: "7 kg",
    note: "Ajuste direito: pé direito atrás do banco; outro pé ao lado do banco\nAjuste esquerdo: pé esquerdo atrás da máquina; pé direito ao lado direito",
    primary: "biceps", secondary: [], others: ["antebraco"],
  },
  {
    slug: "agachamento_pendulo",
    name: "Agachamento pendulum",
    refWeight: "25–27,5 kg",
    note: "",
    primary: "quadriceps", secondary: ["gluteos"], others: [],
  },
  {
    slug: "agachamento-smith",
    name: "Agachamento smith",
    refWeight: "",
    note: "",
    primary: "quadriceps", secondary: ["gluteos", "posterior"], others: [],
  },
  {
    slug: "agachamento_bulgaro",
    name: "Agachamento búlgaro",
    refWeight: "4 kg",
    note: "",
    primary: "quadriceps", secondary: ["gluteos"], others: ["posterior"],
  },
  {
    slug: "leg_press_45",
    name: "Leg press 45°",
    refWeight: "105–110 kg",
    note: "",
    primary: "quadriceps", secondary: ["gluteos"], others: ["posterior"],
  },
  {
    slug: "cadeira_extensora",
    name: "Cadeira extensora",
    refWeight: "47,5 kg",
    note: "Ajuste: pós. 5; L",
    primary: "quadriceps", secondary: [], others: [],
  },
  {
    slug: "cadeira_extensora_unilateral",
    name: "Cadeira extensora unilateral",
    refWeight: "carga a calibrar",
    note: "Ajuste: pós. 5; L",
    primary: "quadriceps", secondary: [], others: [],
  },
  {
    slug: "cadeira_flexora_unilateral",
    name: "Cadeira flexora unilateral",
    refWeight: "15–17,5 kg por lado",
    note: "",
    primary: "posterior", secondary: [], others: [],
  },
  {
    slug: "cadeira_flexora_bilateral",
    name: "Cadeira flexora bilateral",
    refWeight: "50–52,5 kg",
    note: "Ajuste: pós. 5; 0; XL",
    primary: "posterior", secondary: [], others: [],
  },
  {
    slug: "rdl_stiff",
    name: "RDL / Stiff",
    refWeight: "12,5–15 kg cada lado",
    note: "",
    primary: "posterior", secondary: ["gluteos"], others: ["lombar"],
  },
  {
    slug: "hip_thrust",
    name: "Hip thrust",
    refWeight: "15–20 kg cada lado",
    note: "",
    primary: "gluteos", secondary: ["posterior"], others: [],
  },
  {
    slug: "abdutora_maquina",
    name: "Abdutora máquina",
    refWeight: "75–80 kg",
    note: "Alternativa abdutor complexo: 20 kg cada lado; pós. 3; movimento de cima para baixo",
    primary: "gluteos", secondary: ["adutores"], others: [],
  },
  {
    slug: "panturrilha_smith",
    name: "Panturrilha em pé no Smith",
    refWeight: "20–22,5 kg cada lado",
    note: "",
    primary: "panturrilha", secondary: [], others: [],
  },
  {
    slug: "panturrilha_leg_press",
    name: "Panturrilha no leg press",
    refWeight: "~105 kg",
    note: "Ajuste: última posição",
    primary: "panturrilha", secondary: [], others: [],
  },
  {
    slug: "abdominal_maquina",
    name: "Abdominal máquina",
    refWeight: "55–60 kg",
    note: "Ajuste: pós. 4",
    primary: "abdomen", secondary: [], others: [],
  },
];

// entries: [exerciseSlug, targetSets, reps] in card order. Single rep
// target per entry ("3×12"); the owner's original ranges were collapsed to
// their top number.
export const SEED_PROGRAMS = [
  {
    slug: "ppl-ul",
    name: "PPL + Upper Lower",
    days: [
      {
        slug: "push", name: "Push",
        entries: [
          ["supino_maquina", 3, 10],
          ["supino_inclinado_halteres", 3, 12],
          ["crucifixo_maquina", 2, 15],
          ["desenvolvimento_ombros_maquina", 2, 12],
          ["elevacao_lateral_unilateral_polia", 3, 20],
          ["triceps_pushdown", 2, 12],
          ["triceps_frances_unilateral_halter", 2, 15],
        ],
      },
      {
        slug: "pull", name: "Pull",
        entries: [
          ["puxada_alta_maquina", 3, 10],
          ["remada_fechada_unilateral_maquina", 3, 12],
          ["remada_alta_articulada_maquina", 2, 12],
          ["face_pull", 2, 20],
          ["biceps_maquina", 2, 12],
          ["biceps_scott_unilateral_halter", 2, 15],
        ],
      },
      {
        slug: "legs", name: "Legs",
        entries: [
          ["agachamento_pendulo", 3, 10],
          ["leg_press_45", 2, 15],
          ["cadeira_extensora", 2, 15],
          ["cadeira_flexora_unilateral", 3, 15],
          ["panturrilha_smith", 3, 15],
          ["abdominal_maquina", 2, 15],
        ],
      },
      {
        slug: "upper", name: "Upper",
        entries: [
          ["supino_maquina", 2, 12],
          ["supino_inclinado_halteres", 2, 12],
          ["puxada_alta_maquina", 2, 12],
          ["remada_alta_articulada_maquina", 2, 12],
          ["elevacao_lateral_unilateral_polia", 2, 20],
          ["triceps_testa_polia", 2, 15],
          ["biceps_scott_unilateral_halter", 2, 15],
        ],
      },
      {
        slug: "lower", name: "Lower",
        entries: [
          ["rdl_stiff", 3, 10],
          ["leg_press_45", 3, 12],
          ["hip_thrust", 2, 12],
          ["cadeira_flexora_bilateral", 2, 15],
          ["cadeira_extensora_unilateral", 2, 15],
          ["panturrilha_leg_press", 3, 15],
          ["abdutora_maquina", 2, 20],
        ],
      },
    ],
  },
  {
    slug: "fb-ul",
    name: "Full Body + Upper Lower",
    days: [
      {
        slug: "fullbody", name: "Full Body",
        entries: [
          ["supino_maquina", 3, 10],
          ["puxada_alta_maquina", 3, 10],
          ["remada_fechada_unilateral_maquina", 2, 12],
          ["agachamento_pendulo", 3, 10],
          ["cadeira_flexora_unilateral", 3, 15],
          ["elevacao_lateral_unilateral_polia", 3, 20],
          ["face_pull", 2, 20],
          ["biceps_scott_unilateral_halter", 3, 15],
          ["triceps_frances_unilateral_halter", 3, 15],
        ],
      },
      {
        slug: "upper", name: "Upper",
        entries: [
          ["supino_inclinado_halteres", 3, 12],
          ["supino_maquina", 2, 12],
          ["crucifixo_maquina", 3, 15],
          ["desenvolvimento_ombros_maquina", 2, 12],
          ["puxada_alta_maquina", 3, 12],
          ["remada_alta_articulada_maquina", 3, 12],
          ["biceps_maquina", 3, 12],
          ["triceps_pushdown", 3, 12],
        ],
      },
      {
        slug: "lower", name: "Lower",
        entries: [
          ["rdl_stiff", 3, 10],
          ["leg_press_45", 3, 12],
          ["agachamento_bulgaro", 3, 12],
          ["hip_thrust", 2, 12],
          ["cadeira_flexora_bilateral", 4, 15],
          ["cadeira_extensora", 3, 15],
          ["panturrilha_leg_press", 3, 15],
          ["abdominal_maquina", 2, 15],
        ],
      },
    ],
  },
];
