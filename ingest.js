// Neo-Synapse BioMap - Note Ingestion and Inline Syntax Parser with Neuro-Anatomy

// Pre-defined synonyms mapping for fast auto-recognition of muscles/concepts in Korean
const CONCEPT_SYNONYMS = {
  "장요근": { id: "L3_ILIOPSOAS", label: "Iliopsoas", layer: "L3", type: "Muscle" },
  "iliopsoas": { id: "L3_ILIOPSOAS", label: "Iliopsoas", layer: "L3", type: "Muscle" },
  "대둔근": { id: "L3_GMAX", label: "Gluteus Maximus", layer: "L3", type: "Muscle" },
  "gluteus maximus": { id: "L3_GMAX", label: "Gluteus Maximus", layer: "L3", type: "Muscle" },
  "gmax": { id: "L3_GMAX", label: "Gluteus Maximus", layer: "L3", type: "Muscle" },
  "중둔근": { id: "L3_GMED", label: "Gluteus Medius", layer: "L3", type: "Muscle" },
  "gluteus medius": { id: "L3_GMED", label: "Gluteus Medius", layer: "L3", type: "Muscle" },
  "gmed": { id: "L3_GMED", label: "Gluteus Medius", layer: "L3", type: "Muscle" },
  "기립근": { id: "L3_ESPINAE", label: "Erector Spinae", layer: "L3", type: "Muscle" },
  "척추기립근": { id: "L3_ESPINAE", label: "Erector Spinae", layer: "L3", type: "Muscle" },
  "erector spinae": { id: "L3_ESPINAE", label: "Erector Spinae", layer: "L3", type: "Muscle" },
  "대대근막장근": { id: "L3_TFL", label: "Tensor Fasciae Latae", layer: "L3", type: "Muscle" },
  "대퇴근막장근": { id: "L3_TFL", label: "Tensor Fasciae Latae", layer: "L3", type: "Muscle" },
  "tfl": { id: "L3_TFL", label: "Tensor Fasciae Latae", layer: "L3", type: "Muscle" },
  "상부승모근": { id: "L3_UTRAP", label: "Upper Trapezius", layer: "L3", type: "Muscle" },
  "상부 승모근": { id: "L3_UTRAP", label: "Upper Trapezius", layer: "L3", type: "Muscle" },
  "upper trapezius": { id: "L3_UTRAP", label: "Upper Trapezius", layer: "L3", type: "Muscle" },
  "하부승모근": { id: "L3_LTRAP", label: "Lower Trapezius", layer: "L3", type: "Muscle" },
  "하부 승모근": { id: "L3_LTRAP", label: "Lower Trapezius", layer: "L3", type: "Muscle" },
  "lower trapezius": { id: "L3_LTRAP", label: "Lower Trapezius", layer: "L3", type: "Muscle" },
  "Serratus Anterior": { id: "L3_SA", label: "Serratus Anterior", layer: "L3", type: "Muscle" },
  "전거근": { id: "L3_SA", label: "Serratus Anterior", layer: "L3", type: "Muscle" },
  "심부경부굴곡근": { id: "L3_DNF", label: "Deep Neck Flexors", layer: "L3", type: "Muscle" },
  "deep neck flexors": { id: "L3_DNF", label: "Deep Neck Flexors", layer: "L3", type: "Muscle" },

  // Neurology / Control
  "상호억제": { id: "L2_RECIP_INHIB", label: "Reciprocal Inhibition", layer: "L2", type: "Neurology" },
  "상호 억제": { id: "L2_RECIP_INHIB", label: "Reciprocal Inhibition", layer: "L2", type: "Neurology" },
  "reciprocal inhibition": { id: "L2_RECIP_INHIB", label: "Reciprocal Inhibition", layer: "L2", type: "Neurology" },
  "발바닥 수용기": { id: "L1_FOOT_MECH", label: "Foot Sole Mechanoreceptors", layer: "L1", type: "Sensory" },
  "발바닥 감각": { id: "L1_FOOT_MECH", label: "Foot Sole Mechanoreceptors", layer: "L1", type: "Sensory" },
  "미주신경": { id: "L2_VAGUS", label: "Vagus Nerve", layer: "L2", type: "Neurology" },
  "vagus nerve": { id: "L2_VAGUS", label: "Vagus Nerve", layer: "L2", type: "Neurology" },
  "교감신경": { id: "L2_SYMPATHETIC", label: "Sympathetic Chain", layer: "L2", type: "Neurology" },
  "sympathetic chain": { id: "L2_SYMPATHETIC", label: "Sympathetic Chain", layer: "L2", type: "Neurology" },
  "부교감신경": { id: "L2_PARASYMPATHETIC", label: "Parasympathetic System", layer: "L2", type: "Neurology" },
  
  // Receptors (L1)
  "경동맥소체": { id: "L1_CAROTID_BODY", label: "Carotid Body Receptors", layer: "L1", type: "Sensory" },
  
  // Organ targets (L3)
  "심장": { id: "L3_HEART", label: "Cardiac Tissue", layer: "L3", type: "Organ" },
  "위장관": { id: "L3_STOMACH", label: "Gastrointestinal Organ", layer: "L3", type: "Organ" },
  "위장운동촉진": { id: "L3_STOMACH", label: "Gastrointestinal Organ", layer: "L3", type: "Organ" },
  
  // Clinical outcomes (L4)
  "서맥유발": { id: "L4_BRADYCARDIA", label: "Bradycardia Response", layer: "L4", type: "Clinical" },
  "안면마비": { id: "L4_FACIAL_PALSY", label: "Facial Palsy Syndrome", layer: "L4", type: "Clinical" },
  "피질척수로": { id: "L2_CORTICOSPINAL", label: "Corticospinal Tract", layer: "L2", type: "Neurology" }
};

export const NOTES_PRESETS = []; // Removed all pre-loaded sample contents

// Parser function that parses both inline rules and suggests using AI
export function parseNotesToEntities(text, existingNodes, noteId) {
  const lines = text.split('\n');
  const extractedNodes = [];
  const extractedLinks = [];

  const nodeNameMap = new Map();
  existingNodes.forEach(n => {
    nodeNameMap.set(n.label.toLowerCase(), n);
    nodeNameMap.set(n.id.toLowerCase(), n);
  });

  Object.keys(CONCEPT_SYNONYMS).forEach(syn => {
    nodeNameMap.set(syn.toLowerCase(), CONCEPT_SYNONYMS[syn]);
  });

  const newlyCreatedNodeMap = new Map();

  const getOrCreateNode = (name) => {
    const cleanName = name.trim();
    const lowerName = cleanName.toLowerCase();

    if (nodeNameMap.has(lowerName)) {
      return nodeNameMap.get(lowerName);
    }

    if (newlyCreatedNodeMap.has(lowerName)) {
      return newlyCreatedNodeMap.get(lowerName);
    }

    const customId = `MEMBER_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    let layer = "L3";
    let type = "Muscle";

    if (lowerName.includes("증후군") || lowerName.includes("보행") || lowerName.includes("임상") || lowerName.includes("패턴") || lowerName.includes("마비") || lowerName.includes("반응") || lowerName.includes("유발")) {
      layer = "L4";
      type = "Clinical";
    } else if (lowerName.includes("수용기") || lowerName.includes("감각") || lowerName.includes("소체")) {
      layer = "L1";
      type = "Sensory";
    } else if (lowerName.includes("신경") || lowerName.includes("반사") || lowerName.includes("통제") || lowerName.includes("척수로") || lowerName.includes("통로")) {
      layer = "L2";
      type = "Neurology";
    } else if (lowerName.includes("위장") || lowerName.includes("심장") || lowerName.includes("폐") || lowerName.includes("장기")) {
      layer = "L3";
      type = "Organ";
    }

    const newNode = {
      id: customId,
      label: cleanName,
      layer: layer,
      type: type,
      desc: `'${cleanName}' node automatically generated from study notes.`,
      noteId: noteId
    };

    newlyCreatedNodeMap.set(lowerName, newNode);
    extractedNodes.push(newNode);
    return newNode;
  };

  // --- Inline Syntax Parser Loop ---
  lines.forEach(line => {
    const match = line.match(/^\s*([^-]+?)\s*->\s*([^\[\n]+?)(?:\s*\[([^\]\n]+)\])?\s*$/);
    
    if (match) {
      const sourceName = match[1].trim();
      const targetName = match[2].trim();
      const relLabel = match[3] ? match[3].trim() : "지식 연결";

      const sourceNode = getOrCreateNode(sourceName);
      const targetNode = getOrCreateNode(targetName);

      let type = "coordinates";
      const lowerLabel = relLabel.toLowerCase();
      if (lowerLabel.includes("억제") || lowerLabel.includes("inhib")) type = "inhibits";
      else if (lowerLabel.includes("유발") || lowerLabel.includes("촉진") || lowerLabel.includes("trigger") || lowerLabel.includes("반사") || lowerLabel.includes("활성")) type = "triggers";
      else if (lowerLabel.includes("지배") || lowerLabel.includes("innervate")) type = "innervates";
      else if (lowerLabel.includes("보상") || lowerLabel.includes("compensate")) type = "compensates";
      else if (lowerLabel.includes("예방") || lowerLabel.includes("prevent") || lowerLabel.includes("안정")) type = "prevents";
      else if (lowerLabel.includes("구성") || lowerLabel.includes("속함") || lowerLabel.includes("part")) type = "part_of";

      extractedLinks.push({
        source: sourceNode.id,
        target: targetNode.id,
        type: type,
        label: relLabel,
        desc: `Pasted Notes connection: ${sourceNode.label} leads to ${targetNode.label} via '${relLabel}'.`,
        noteId: noteId
      });
    }
  });

  return {
    nodes: extractedNodes,
    links: extractedLinks
  };
}
