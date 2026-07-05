// Neo-Synapse BioMap - Active Recall Quiz Engine

export class QuizEngine {
  constructor(getNodesFn, getLinksFn, onFinished) {
    this.getNodes = getNodesFn;
    this.getLinks = getLinksFn;
    this.onFinished = onFinished;

    this.questions = [];
    this.currentQuestionIdx = 0;
    this.score = 0;
    
    // Timer state
    this.timerInterval = null;
    this.secondsElapsed = 0;

    // Strengthened connections track
    this.strengthenedLinks = [];
  }

  // Generate 5 questions dynamically based on current database
  generateQuiz() {
    const nodes = this.getNodes();
    const links = this.getLinks();
    this.questions = [];
    this.currentQuestionIdx = 0;
    this.score = 0;
    this.strengthenedLinks = [];

    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // Type 1: Link relationships (X triggers Y, X inhibits Y, etc.)
    const activeLinks = links.filter(l => {
      const s = nodeMap.get(typeof l.source === 'object' ? l.source.id : l.source);
      const t = nodeMap.get(typeof l.target === 'object' ? l.target.id : l.target);
      return s && t;
    });

    const shuffledLinks = [...activeLinks].sort(() => Math.random() - 0.5);

    shuffledLinks.forEach(link => {
      if (this.questions.length >= 5) return;

      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      const sourceNode = nodeMap.get(sourceId);
      const targetNode = nodeMap.get(targetId);

      let questionText = "";
      let correctAnswer = "";
      let distractors = [];

      if (link.type === "inhibits") {
        questionText = `${sourceNode.label}이/가 과부하 또는 활성화될 때, 신경계 반사 경로를 통해 억제(Inhibition)되는 근육은 무엇인가요?`;
        correctAnswer = targetNode.label;
        distractors = nodes
          .filter(n => n.id !== targetNode.id && n.id !== sourceNode.id && n.type === "Muscle")
          .map(n => n.label);
      } else if (link.type === "innervates") {
        questionText = `${targetNode.label}을/를 직접 지배하여 운동 신호를 전달하는 신경 절전섬유 또는 신경근 분절은 무엇인가요?`;
        correctAnswer = sourceNode.label;
        distractors = nodes
          .filter(n => n.id !== sourceNode.id && n.type === "Neurology")
          .map(n => n.label);
      } else if (link.type === "part_of") {
        const status = link.label.includes("Overactive") || link.label.includes("Tonic") ? "단축/과활성화" : "약화/억제";
        questionText = `얀다(Janda) 이론에 따른 '${targetNode.label}'에서 전형적으로 ${status}되는 요소는 무엇인가요?`;
        correctAnswer = sourceNode.label;
        distractors = nodes
          .filter(n => n.id !== sourceNode.id && n.id !== targetNode.id && (n.type === "Muscle" || n.type === "Neurology"))
          .map(n => n.label);
      } else if (link.type === "compensates") {
        questionText = `${targetNode.label}에서 주요 주동근인 대둔근이 기능하지 못할 때, 보상 작용으로 과도하게 동원되는 협력근은 무엇인가요?`;
        correctAnswer = sourceNode.label;
        distractors = nodes
          .filter(n => n.id !== sourceNode.id && n.id !== targetNode.id && n.type === "Muscle")
          .map(n => n.label);
      }

      if (questionText && correctAnswer && distractors.length >= 3) {
        const selectedDistractors = distractors.sort(() => Math.random() - 0.5).slice(0, 3);
        const options = [correctAnswer, ...selectedDistractors].sort(() => Math.random() - 0.5);

        this.questions.push({
          title: questionText,
          layer: sourceNode.layer,
          options: options,
          correctAnswer: correctAnswer,
          explanation: link.desc || `${sourceNode.label}와/과 ${targetNode.label}의 신경역학적 고리 증명 사례입니다.`,
          link: link
        });
      }
    });

    // Fallback: Dynamic node-layer classification questions based on user's nodes
    if (nodes.length > 0) {
      const shuffledNodes = [...nodes].sort(() => Math.random() - 0.5);
      let nodeIdx = 0;
      while (this.questions.length < 5 && nodeIdx < shuffledNodes.length) {
        const node = shuffledNodes[nodeIdx++];
        
        let layerLabel = "L3. 근골격/장기 (Structural)";
        if (node.layer === "L1") layerLabel = "L1. 감각 입력 (Afferent)";
        else if (node.layer === "L2") layerLabel = "L2. 신경 조절 (Control)";
        else if (node.layer === "L4") layerLabel = "L4. 임상 패턴 (Functional)";

        const options = [
          "L1. 감각 입력 (Afferent)",
          "L2. 신경 조절 (Control)",
          "L3. 근골격/장기 (Structural)",
          "L4. 임상 패턴 (Functional)"
        ];

        const alreadyAsked = this.questions.some(q => q.title.includes(`'${node.label}'`));
        if (!alreadyAsked) {
          this.questions.push({
            title: `등록하신 개념 '${node.label}'은/는 인체 조절 루프 중 어떤 레이어에 분류되어 있나요?`,
            layer: node.layer,
            options: options,
            correctAnswer: layerLabel,
            explanation: `'${node.label}'은/는 사용자가 직접 지정하여 지식 데이터베이스에 저장한 해부학 노드입니다.`,
            link: null
          });
        }
      }
    }

    if (this.questions.length === 0) {
      return false;
    }

    // Limit to 5 questions
    this.questions = this.questions.slice(0, 5);
    return true;
  }

  startTimer(timerDisplayEl) {
    this.secondsElapsed = 0;
    if (this.timerInterval) clearInterval(this.timerInterval);
    
    this.timerInterval = setInterval(() => {
      this.secondsElapsed++;
      const mins = String(Math.floor(this.secondsElapsed / 60)).padStart(2, '0');
      const secs = String(this.secondsElapsed % 60).padStart(2, '0');
      timerDisplayEl.textContent = `${mins}:${secs}`;
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  getCurrentQuestion() {
    return this.questions[this.currentQuestionIdx];
  }

  submitAnswer(selectedOption) {
    const q = this.getCurrentQuestion();
    const isCorrect = selectedOption === q.correctAnswer;
    
    if (isCorrect) {
      this.score++;
      if (q.link) {
        this.strengthenedLinks.push(q.link);
      }
    }
    return isCorrect;
  }

  nextQuestion() {
    this.currentQuestionIdx++;
    return this.currentQuestionIdx < this.questions.length;
  }
}
