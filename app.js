// Neo-Synapse BioMap - Central Application Controller (Analog Note-Compiler)

import { DEFAULT_NOTES, DEFAULT_NODES, DEFAULT_LINKS } from './db.js';
import { BioGraph } from './graph.js';
import { parseNotesToEntities } from './ingest.js';
import { QuizEngine } from './quiz.js';

class AppController {
  constructor() {
    this.notes = [];
    this.nodes = [];
    this.links = [];
    this.graph = null;
    this.quiz = null;

    // View states
    this.selectedNoteId = null;
    this.pendingParsedData = null;
    this.tempNoteId = null;

    this.initData();
    this.initViews();
    this.initListeners();
    this.initOCR();
    
    // Trigger initial UI rendering
    this.renderNotesList();
    this.renderGlobalNodeList();
    this.updateDashboardStats();
  }

  // --- State Initialization & localStore Hydration ---
  initData() {
    const cachedNotes = localStorage.getItem('biomap_ledger_notes_docs');
    const cachedNodes = localStorage.getItem('biomap_ledger_nodes');
    const cachedLinks = localStorage.getItem('biomap_ledger_links');

    if (cachedNotes && cachedNodes && cachedLinks) {
      this.notes = JSON.parse(cachedNotes);
      this.nodes = JSON.parse(cachedNodes);
      this.links = JSON.parse(cachedLinks);
    } else {
      this.notes = [...DEFAULT_NOTES];
      this.nodes = [...DEFAULT_NODES];
      this.links = [...DEFAULT_LINKS];
      this.syncStorage();
    }
  }

  syncStorage() {
    localStorage.setItem('biomap_ledger_notes_docs', JSON.stringify(this.notes));
    localStorage.setItem('biomap_ledger_nodes', JSON.stringify(this.nodes));
    localStorage.setItem('biomap_ledger_links', JSON.stringify(this.links));
  }

  // --- Views and Graph Initialization ---
  initViews() {
    this.graph = new BioGraph('graph-canvas', (node) => this.onNodeSelected(node));
    this.graph.setData(this.nodes, this.links);

    lucide.createIcons();
  }

  // --- Event Bindings ---
  initListeners() {
    // 1. Navigation tabs switches
    const tabButtons = document.querySelectorAll('.nav-item');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTabId = btn.getAttribute('data-tab');
        
        tabButtons.forEach(b => b.classList.remove('active'));
        tabPanels.forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        document.getElementById(targetTabId).classList.add('active');

        // Reset highlights when leaving graph tab
        if (targetTabId !== 'tab-graph') {
          if (this.graph) {
            this.graph.highlightNoteId = null;
            this.graph.searchQuery = "";
            document.getElementById('search-nodes').value = "";
          }
        }

        if (targetTabId === 'tab-graph') {
          this.graph.resizeCanvas();
        } else if (targetTabId === 'tab-notes') {
          this.renderNotesList();
        } else if (targetTabId === 'tab-quiz') {
          this.updateDashboardStats();
        }
      });
    });

    // 2. Graph Layer Filters
    const filterToggles = document.querySelectorAll('.layer-toggle');
    filterToggles.forEach(toggle => {
      toggle.addEventListener('click', () => {
        toggle.classList.toggle('active');
        
        const activeLayers = new Set();
        filterToggles.forEach(t => {
          if (t.classList.contains('active')) {
            activeLayers.add(t.getAttribute('data-layer'));
          }
        });
        
        this.graph.updateActiveLayers(activeLayers);
      });
    });

    // 3. Search inputs in graph
    const searchInput = document.getElementById('search-nodes');
    searchInput.addEventListener('input', (e) => {
      this.graph.setSearchQuery(e.target.value);
    });

    // 4. Manual Node Creation inside graph view
    document.getElementById('btn-add-node-manual').addEventListener('click', () => {
      this.openEditNodePanel();
    });

    document.getElementById('btn-cancel-edit').addEventListener('click', () => {
      this.closeInspectorEditor();
    });

    document.getElementById('node-edit-form').addEventListener('submit', (e) => {
      this.handleSaveNode();
    });

    // 5. Close Inspector Button
    document.getElementById('btn-close-inspector').addEventListener('click', () => {
      document.getElementById('concept-inspector').classList.add('collapsed');
      this.graph.setSelectedNode(null);
    });

    // Node details edit/delete action button
    document.getElementById('btn-edit-node').addEventListener('click', () => {
      const activeId = this.graph.selectedNodeId;
      if (activeId) this.openEditNodePanel(activeId);
    });

    document.getElementById('btn-delete-node').addEventListener('click', () => {
      const activeId = this.graph.selectedNodeId;
      if (activeId && confirm("이 노드와 관련된 모든 연결 시냅스가 함께 제거됩니다. 삭제하시겠습니까?")) {
        this.deleteNode(activeId);
      }
    });

    // Backlink redirect in inspector: Clicking on a note source redirects to notes list
    document.getElementById('insp-origin-name').addEventListener('click', () => {
      const node = this.nodes.find(n => n.id === this.graph.selectedNodeId);
      if (node && node.noteId) {
        const originatingNote = this.notes.find(n => n.id === node.noteId);
        if (originatingNote) {
          document.getElementById('btn-tab-notes').click();
          this.viewNoteDetails(originatingNote);
        }
      }
    });

    // 6. Manual Synapse Relation Creation Modal
    document.getElementById('btn-close-rel-modal').addEventListener('click', () => {
      document.getElementById('relation-modal').classList.add('hidden');
    });
    document.getElementById('btn-cancel-rel').addEventListener('click', () => {
      document.getElementById('relation-modal').classList.add('hidden');
    });
    document.getElementById('relation-form').addEventListener('submit', () => {
      this.handleSaveRelation();
    });

    // Toggle inline syntax help box
    document.getElementById('btn-toggle-syntax-help').addEventListener('click', () => {
      document.getElementById('syntax-help-box').classList.toggle('hidden');
    });

    // Parser execution trigger
    document.getElementById('btn-parse-text').addEventListener('click', () => {
      const book = document.getElementById('new-note-book').value.trim();
      const page = document.getElementById('new-note-page').value.trim();
      const paragraph = document.getElementById('new-note-paragraph').value.trim();
      const title = document.getElementById('new-note-title').value.trim();
      const text = document.getElementById('custom-ocr-text').value.trim();

      if (!book || !page || !title || !text) {
        return alert("도서명, 페이지, 노트 제목 및 본문 내용을 모두 채워야 합니다.");
      }

      this.tempNoteId = `NOTE_${Date.now()}`;
      const result = parseNotesToEntities(text, this.nodes, this.tempNoteId);
      this.triggerIngestionVisualizer(result.nodes, result.links);
    });

    // Notes Archive Actions
    document.getElementById('btn-create-note-shortcut').addEventListener('click', () => {
      document.getElementById('btn-tab-ingest').click();
    });

    document.getElementById('btn-delete-note').addEventListener('click', () => {
      if (this.selectedNoteId && confirm("이 노트를 삭제하면, 해당 노트에서 추출된 개념과 시냅스 고리들도 전부 지워집니다. 삭제할까요?")) {
        this.deleteNoteDoc(this.selectedNoteId);
      }
    });

    document.getElementById('btn-highlight-on-graph').addEventListener('click', () => {
      if (this.selectedNoteId) {
        this.graph.highlightNoteId = this.selectedNoteId;
        document.getElementById('btn-tab-graph').click();
        const note = this.notes.find(n => n.id === this.selectedNoteId);
        alert(`'${note.title}' 노트에 속한 역학 고리들만 그래프에 필터링 표시합니다.`);
      }
    });

    // Sort listener in inspector nodes list
    document.getElementById('sort-nodes-select').addEventListener('change', () => {
      this.renderGlobalNodeList();
    });

    // Quiz Engine Handlers
    document.getElementById('btn-start-quiz').addEventListener('click', () => {
      this.startActiveRecallQuiz();
    });

    document.getElementById('btn-submit-answer').addEventListener('click', () => {
      this.submitQuizAnswer();
    });

    document.getElementById('btn-next-question').addEventListener('click', () => {
      this.nextQuizQuestion();
    });

    document.getElementById('btn-quit-quiz').addEventListener('click', () => {
      if (confirm("복습 퀴즈를 중단하시겠습니까? 기록이 저장되지 않습니다.")) {
        this.exitQuiz();
      }
    });

    document.getElementById('btn-quiz-finish').addEventListener('click', () => {
      this.exitQuiz();
    });

    // Start Fresh: Clear database
    document.getElementById('btn-reset-database').addEventListener('click', () => {
      if (confirm("🚨 경고: 현재 보관된 모든 요약 노트와 직접 맵핑한 해부학 시냅스가 완전히 소멸됩니다. 빈 캔버스로 처음부터 공부 순서대로 지식을 적재하고 싶으시다면 승인하세요. 계속하시겠습니까?")) {
        this.clearDatabase();
      }
    });
  }

  // --- Client-Side Tesseract.js Ingestion ---
  initOCR() {
    const dropzone = document.getElementById('ocr-dropzone');
    const fileInput = document.getElementById('ocr-image-upload');

    // Click handler to open file explorer
    dropzone.addEventListener('click', () => fileInput.click());

    // Drag and drop visual cues
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        this.recognizeImageText(file);
      } else {
        alert("이미지 파일만 업로드할 수 있습니다.");
      }
    });

    // File input select change
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        this.recognizeImageText(file);
        // Clear input to allow uploading the same file again
        fileInput.value = "";
      }
    });
  }

  recognizeImageText(file) {
    const statusContainer = document.getElementById('ocr-status-container');
    const statusText = document.getElementById('ocr-status-text');
    const textarea = document.getElementById('custom-ocr-text');

    statusContainer.classList.remove('hidden');
    statusText.textContent = "로컬 이미지 분석 인프라 기동 중...";

    Tesseract.recognize(
      file,
      'kor+eng', // Parse both Korean and English medical terms
      {
        logger: m => {
          if (m.status === 'recognizing') {
            const pct = Math.round(m.progress * 100);
            statusText.textContent = `이미지 문자 분석 진행 중 (${pct}%)...`;
          } else {
            statusText.textContent = `상태: ${m.status}...`;
          }
        }
      }
    ).then(({ data: { text } }) => {
      statusContainer.classList.add('hidden');
      
      const cleanText = text.trim();
      if (!cleanText) {
        alert("⚠️ 이미지에서 추출할 수 있는 글자가 감지되지 않았습니다. 다른 캡처 이미지를 활용해 주세요.");
        return;
      }

      // Prepend or append the extracted text to editor
      const previousValue = textarea.value.trim();
      textarea.value = previousValue ? previousValue + "\n" + cleanText : cleanText;
      
      alert("📸 문단 이미지 속의 텍스트가 성공적으로 추출되어 하단 편집창에 입력되었습니다!");
    }).catch(err => {
      console.error("[OCR Failure]:", err);
      statusContainer.classList.add('hidden');
      alert("❌ 글자 추출 중 오류가 발생했습니다. 브라우저 보안 또는 CORS 정책을 확인하세요 (로컬 서버로 접속해야 정상 동작합니다).");
    });
  }

  // --- Concept Inspector Node Details View ---
  onNodeSelected(node) {
    this.graph.setSelectedNode(node.id);

    const inspector = document.getElementById('concept-inspector');
    const viewSection = document.getElementById('inspector-content-view');
    const editSection = document.getElementById('inspector-edit-view');
    const defaultSection = document.getElementById('inspector-default-view');

    inspector.classList.remove('collapsed');
    viewSection.classList.remove('hidden');
    editSection.classList.add('hidden');
    defaultSection.classList.add('hidden');

    const layerBadge = document.getElementById('insp-layer-badge');
    layerBadge.className = `node-badge ${node.layer}`;
    layerBadge.textContent = `${node.layer}. ${this.getLayerName(node.layer)}`;

    document.getElementById('insp-title').textContent = node.label;
    document.getElementById('insp-type-badge').textContent = node.type;
    document.getElementById('insp-desc').textContent = node.desc;

    // Resolve Origin note link
    const originEl = document.getElementById('insp-origin-name');
    if (node.noteId) {
      const note = this.notes.find(n => n.id === node.noteId);
      if (note) {
        originEl.textContent = `${note.book} p.${note.page} ${note.paragraph ? '('+note.paragraph+')' : ''}`;
        originEl.style.textDecoration = 'underline';
        originEl.style.cursor = 'pointer';
      } else {
        originEl.textContent = "기초 해부학";
        originEl.style.textDecoration = 'none';
        originEl.style.cursor = 'default';
      }
    } else {
      originEl.textContent = "기초 해부학";
      originEl.style.textDecoration = 'none';
      originEl.style.cursor = 'default';
    }

    this.renderNodeRelations(node.id);
  }

  getLayerName(layer) {
    switch (layer) {
      case 'L1': return "감각 입력 (Afferent)";
      case 'L2': return "신경 조절 (Control)";
      case 'L3': return "근골격/장기 (Structural)";
      case 'L4': return "임상 패턴 (Functional)";
      default: return "기타";
    }
  }

  renderNodeRelations(nodeId) {
    const listEl = document.getElementById('insp-relations');
    listEl.innerHTML = "";

    const connectedLinks = this.links.filter(link => {
      const sId = typeof link.source === 'object' ? link.source.id : link.source;
      const tId = typeof link.target === 'object' ? link.target.id : link.target;
      return sId === nodeId || tId === nodeId;
    });

    if (connectedLinks.length === 0) {
      listEl.innerHTML = `<p style="font-size:12px; color:var(--text-muted);">형성된 시냅스 관계가 없습니다.</p>`;
    } else {
      connectedLinks.forEach(link => {
        const sId = typeof link.source === 'object' ? link.source.id : link.source;
        const tId = typeof link.target === 'object' ? link.target.id : link.target;
        
        const isSource = sId === nodeId;
        const linkedId = isSource ? tId : sId;
        const linkedNode = this.nodes.find(n => n.id === linkedId);

        if (!linkedNode) return;

        const item = document.createElement('div');
        item.className = 'relation-item';
        item.innerHTML = `
          <div class="relation-meta">
            <span class="relation-type">${link.label || link.type}</span>
            <span class="relation-target">${linkedNode.label}</span>
          </div>
          <p class="relation-desc">${link.desc || '설명 없음'}</p>
        `;
        item.addEventListener('click', () => {
          this.onNodeSelected(linkedNode);
        });
        listEl.appendChild(item);
      });
    }

    const addRelBtn = document.createElement('button');
    addRelBtn.className = "btn-secondary-outline";
    addRelBtn.style.width = "100%";
    addRelBtn.style.marginTop = "8px";
    addRelBtn.innerHTML = `<i data-lucide="git-branch" style="width:14px;height:14px;"></i> 연결 추가`;
    addRelBtn.addEventListener('click', () => this.openAddRelationModal(nodeId));
    listEl.appendChild(addRelBtn);

    lucide.createIcons();
  }

  // --- Notes Archive Panel Views ---
  renderNotesList() {
    const listEl = document.getElementById('archived-notes-list');
    listEl.innerHTML = "";

    if (this.notes.length === 0) {
      listEl.innerHTML = `<p style="font-size: 12px; color: var(--text-muted); text-align:center; padding: 20px;">보관된 요약 노트가 없습니다.</p>`;
      return;
    }

    const sortedNotes = [...this.notes].sort((a, b) => b.id.localeCompare(a.id));

    sortedNotes.forEach(note => {
      const card = document.createElement('div');
      card.className = `note-item-card ${this.selectedNoteId === note.id ? 'active' : ''}`;
      
      const snippet = note.text.substring(0, 50).replace(/\n/g, ' ') + (note.text.length > 50 ? '...' : '');
      const citation = `${note.book} p.${note.page} ${note.paragraph ? '('+note.paragraph+')' : ''}`;

      let keywordsHtml = "";
      if (note.keywords && note.keywords.length > 0) {
        keywordsHtml = `<div class="note-keywords-sub">` + 
          note.keywords.map(kw => `<span class="keyword-sub-chip">#${kw}</span>`).join('') + 
          `</div>`;
      }

      card.innerHTML = `
        <h4>${note.title}</h4>
        <span class="note-date-sub">${citation} | ${note.date}</span>
        ${keywordsHtml}
        <p class="note-preview" style="margin-top:8px;">${snippet}</p>
      `;

      card.addEventListener('click', () => {
        this.viewNoteDetails(note);
        const allCards = listEl.querySelectorAll('.note-item-card');
        allCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
      });

      listEl.appendChild(card);
    });
  }

  viewNoteDetails(note) {
    this.selectedNoteId = note.id;

    document.getElementById('note-viewer-empty').classList.add('hidden');
    const contentBox = document.getElementById('note-viewer-content');
    contentBox.classList.remove('hidden');

    document.getElementById('note-view-title').textContent = note.title;
    document.getElementById('note-view-citation').textContent = `${note.book} p.${note.page} ${note.paragraph ? '- ' + note.paragraph : ''}`;
    document.getElementById('note-view-date').textContent = note.date;
    document.getElementById('note-view-text').textContent = note.text;

    const keywordsEl = document.getElementById('note-view-keywords');
    keywordsEl.innerHTML = "";
    if (note.keywords && note.keywords.length > 0) {
      note.keywords.forEach(kw => {
        const chip = document.createElement('span');
        chip.className = 'keyword-chip';
        chip.textContent = `# ${kw}`;
        keywordsEl.appendChild(chip);
      });
    }

    const mappedNodes = this.nodes.filter(n => n.noteId === note.id);
    const mappedLinks = this.links.filter(l => l.noteId === note.id);

    const mappingsEl = document.getElementById('note-view-mappings');
    mappingsEl.innerHTML = "";

    if (mappedNodes.length === 0 && mappedLinks.length === 0) {
      mappingsEl.innerHTML = `<span style="font-size:12px; color:var(--text-muted);">이 노트에서 추출되거나 귀속된 해부학 노드가 존재하지 않습니다.</span>`;
    } else {
      mappedNodes.forEach(node => {
        const chip = document.createElement('div');
        chip.className = `mapped-relation-chip node-badge ${node.layer}`;
        chip.innerHTML = `<span><strong>[개념]</strong> ${node.label} (${node.type})</span>`;
        mappingsEl.appendChild(chip);
      });

      mappedLinks.forEach(link => {
        const sName = this.getNodeLabel(link.source);
        const tName = this.getNodeLabel(link.target);

        const chip = document.createElement('div');
        chip.className = 'mapped-relation-chip';
        chip.innerHTML = `<span>${sName} ➔ <strong>[${link.label}]</strong> ➔ ${tName}</span>`;
        mappingsEl.appendChild(chip);
      });
    }

    lucide.createIcons();
  }

  deleteNoteDoc(noteId) {
    this.notes = this.notes.filter(n => n.id !== noteId);
    this.nodes = this.nodes.filter(n => n.noteId !== noteId);
    this.links = this.links.filter(l => l.noteId !== noteId);

    this.nodes.forEach(n => {
      if (n.noteId === noteId) n.noteId = null;
    });
    this.links.forEach(l => {
      if (l.noteId === noteId) l.noteId = null;
    });

    this.syncStorage();
    this.graph.setData(this.nodes, this.links);

    this.selectedNoteId = null;
    document.getElementById('note-viewer-content').classList.add('hidden');
    document.getElementById('note-viewer-empty').classList.remove('hidden');

    this.renderNotesList();
    this.renderGlobalNodeList();
    this.updateDashboardStats();

    alert("노트와 귀속된 해부학 고리들이 완전히 삭제되었습니다.");
  }

  // --- Ingestion Parsing & Interactive Configurator Layouts ---
  triggerIngestionVisualizer(nodes, links) {
    const empty = document.getElementById('ingest-result-empty');
    const content = document.getElementById('ingest-result-content');

    empty.classList.add('hidden');
    content.classList.remove('hidden');

    content.innerHTML = `
      <div class="result-placeholder">
        <i data-lucide="cpu" class="animate-spin ai-bot-icon" style="color:var(--color-primary)"></i>
        <p>인라인 관계 규칙 및 AI 스캔 진행 중...</p>
      </div>
    `;
    lucide.createIcons();

    setTimeout(() => {
      this.pendingParsedData = { nodes, links };

      content.innerHTML = `
        <div class="ai-status-bar">
          <span class="ai-success"><i data-lucide="check-circle"></i> 파싱 분석 완료</span>
          <span id="extracted-stats">${nodes.length}개 노드, ${links.length}개 시냅스 생성됨</span>
        </div>
        <div class="extracted-section">
          <h4>포함될 바이오 노드 (개념 미세 조정)</h4>
          <div class="extracted-nodes" id="extracted-nodes-list"></div>
        </div>
        <div class="extracted-section">
          <h4>생성될 시냅스 관계 (연결선)</h4>
          <div class="extracted-links" id="extracted-links-list"></div>
        </div>
        <div class="confirm-actions">
          <button id="btn-reject-ingest" class="btn-danger-outline">취소</button>
          <button id="btn-accept-ingest" class="btn-success">
            <i data-lucide="file-plus"></i> 노트 저장 및 맵핑 업데이트
          </button>
        </div>
      `;

      const nodesContainer = document.getElementById('extracted-nodes-list');
      if (nodes.length === 0) {
        nodesContainer.innerHTML = `<span style="font-size:12px; color:var(--text-muted);">새로 발견된 지식 노드가 없습니다. (전부 이미 데이터베이스에 존재)</span>`;
      } else {
        nodes.forEach(node => {
          const card = document.createElement('div');
          card.className = 'extracted-node-card';
          card.setAttribute('data-id', node.id);
          card.innerHTML = `
            <input type="text" class="node-label-input" value="${node.label}">
            <select class="node-select-config node-layer-select">
              <option value="L1" ${node.layer === 'L1' ? 'selected' : ''}>L1. 감각 입력</option>
              <option value="L2" ${node.layer === 'L2' ? 'selected' : ''}>L2. 신경 조절</option>
              <option value="L3" ${node.layer === 'L3' ? 'selected' : ''}>L3. 근골격/장기</option>
              <option value="L4" ${node.layer === 'L4' ? 'selected' : ''}>L4. 임상/증상</option>
            </select>
            <select class="node-select-config node-type-select">
              <option value="Muscle" ${node.type === 'Muscle' ? 'selected' : ''}>Muscle</option>
              <option value="Joint" ${node.type === 'Joint' ? 'selected' : ''}>Joint/Bone</option>
              <option value="Neurology" ${node.type === 'Neurology' ? 'selected' : ''}>Nerve/Tract</option>
              <option value="Sensory" ${node.type === 'Sensory' ? 'selected' : ''}>Receptor</option>
              <option value="Organ" ${node.type === 'Organ' ? 'selected' : ''}>Organ/Visceral</option>
              <option value="Clinical" ${node.type === 'Clinical' ? 'selected' : ''}>Clinical/Syndrome</option>
            </select>
          `;
          nodesContainer.appendChild(card);
        });
      }

      const linksContainer = document.getElementById('extracted-links-list');
      if (links.length === 0) {
        linksContainer.innerHTML = `<p style="font-size:12px; color:var(--text-muted);">인라인 관계 규칙 기호를 파싱해 주동근->길항근 등의 맵핑을 성사시키세요.</p>`;
      } else {
        links.forEach(link => {
          const sName = this.getNodeLabel(link.source) || link.source;
          const tName = this.getNodeLabel(link.target) || link.target;
          
          const row = document.createElement('div');
          row.className = 'extracted-link-row';
          row.innerHTML = `
            <span>${sName}</span>
            <span class="arrow">➔</span>
            <span class="relation">${link.label || link.type}</span>
            <span class="arrow">➔</span>
            <span>${tName}</span>
          `;
          linksContainer.appendChild(row);
        });
      }

      document.getElementById('btn-accept-ingest').addEventListener('click', () => this.acceptParsedNote());
      document.getElementById('btn-reject-ingest').addEventListener('click', () => this.discardParsedNote());

      lucide.createIcons();
    }, 1000);
  }

  acceptParsedNote() {
    if (!this.pendingParsedData || !this.tempNoteId) return;

    const book = document.getElementById('new-note-book').value.trim();
    const page = document.getElementById('new-note-page').value.trim();
    const paragraph = document.getElementById('new-note-paragraph').value.trim();
    const title = document.getElementById('new-note-title').value.trim();
    const text = document.getElementById('custom-ocr-text').value.trim();
    
    const kwInput = document.getElementById('new-note-keywords').value.trim();
    const keywords = kwInput ? kwInput.split(/[\s,]+/).map(k => k.trim()).filter(k => k.length > 0) : [];

    // Save new note doc
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    
    const newNote = {
      id: this.tempNoteId,
      title: title,
      date: formattedDate,
      text: text,
      book: book,
      page: page,
      paragraph: paragraph,
      keywords: keywords
    };

    // Read configurations of newly parsed nodes from DOM
    const { nodes: newNodes, links: newLinks } = this.pendingParsedData;
    const cards = document.querySelectorAll('.extracted-node-card');
    
    cards.forEach(card => {
      const nid = card.getAttribute('data-id');
      const label = card.querySelector('.node-label-input').value.trim();
      const layer = card.querySelector('.node-layer-select').value;
      const type = card.querySelector('.node-type-select').value;

      const targetNode = newNodes.find(n => n.id === nid);
      if (targetNode) {
        targetNode.label = label;
        targetNode.layer = layer;
        targetNode.type = type;
      }
    });

    this.notes.push(newNote);

    // Add new nodes
    newNodes.forEach(node => {
      if (!this.nodes.some(existing => existing.id === node.id)) {
        node.keywords = [...keywords];
        this.nodes.push(node);
      }
    });

    // Tag keywords to all participating nodes (new and existing) linked in this note study session
    const nodeIdsInNote = new Set(newNodes.map(n => n.id));
    newLinks.forEach(link => {
      const sId = typeof link.source === 'object' ? link.source.id : link.source;
      const tId = typeof link.target === 'object' ? link.target.id : link.target;
      nodeIdsInNote.add(sId);
      nodeIdsInNote.add(tId);
    });

    this.nodes.forEach(node => {
      if (nodeIdsInNote.has(node.id)) {
        if (!node.keywords) node.keywords = [];
        keywords.forEach(kw => {
          if (!node.keywords.includes(kw)) {
            node.keywords.push(kw);
          }
        });
      }
    });

    // Add new links
    newLinks.forEach(link => {
      const sId = typeof link.source === 'object' ? link.source.id : link.source;
      const tId = typeof link.target === 'object' ? link.target.id : link.target;
      
      const exists = this.links.some(existing => {
        const exS = typeof existing.source === 'object' ? existing.source.id : existing.source;
        const exT = typeof existing.target === 'object' ? existing.target.id : existing.target;
        return exS === sId && exT === tId && existing.type === link.type;
      });

      if (!exists) {
        this.links.push(link);
      }
    });

    this.syncStorage();
    this.graph.setData(this.nodes, this.links);
    
    alert("노트가 기록 보관소에 저장되었고, 유기적 관계도가 맵에 적재되었습니다!");

    this.discardParsedNote();

    document.getElementById('btn-tab-notes').click();
    this.viewNoteDetails(newNote);
    this.renderNotesList();
  }

  discardParsedNote() {
    this.pendingParsedData = null;
    this.tempNoteId = null;
    document.getElementById('new-note-book').value = "";
    document.getElementById('new-note-page').value = "";
    document.getElementById('new-note-paragraph').value = "";
    document.getElementById('new-note-title').value = "";
    document.getElementById('new-note-keywords').value = "";
    document.getElementById('custom-ocr-text').value = "";
    document.getElementById('ingest-result-empty').classList.remove('hidden');
    document.getElementById('ingest-result-content').classList.add('hidden');
  }

  // --- Manual Node Editing ---
  openEditNodePanel(nodeId = null) {
    const viewSection = document.getElementById('inspector-content-view');
    const editSection = document.getElementById('inspector-edit-view');
    const defaultSection = document.getElementById('inspector-default-view');
    const inspector = document.getElementById('concept-inspector');

    inspector.classList.remove('collapsed');
    viewSection.classList.add('hidden');
    defaultSection.classList.add('hidden');
    editSection.classList.remove('hidden');

    const formTitle = document.getElementById('edit-panel-title');
    const idInput = document.getElementById('edit-node-id');
    const labelInput = document.getElementById('edit-node-label');
    const layerSelect = document.getElementById('edit-node-layer');
    const typeSelect = document.getElementById('edit-node-type');
    const descInput = document.getElementById('edit-node-desc');

    if (nodeId) {
      const node = this.nodes.find(n => n.id === nodeId);
      formTitle.textContent = "바이오 노드 수정";
      idInput.value = node.id;
      labelInput.value = node.label;
      layerSelect.value = node.layer;
      typeSelect.value = node.type;
      descInput.value = node.desc;
    } else {
      formTitle.textContent = "새 바이오 노드 추가";
      idInput.value = "";
      labelInput.value = "";
      layerSelect.value = "L3";
      typeSelect.value = "Muscle";
      descInput.value = "";
    }
  }

  closeInspectorEditor() {
    const editSection = document.getElementById('inspector-edit-view');
    const defaultSection = document.getElementById('inspector-default-view');
    
    editSection.classList.add('hidden');
    
    if (this.graph.selectedNodeId) {
      const node = this.nodes.find(n => n.id === this.graph.selectedNodeId);
      this.onNodeSelected(node);
    } else {
      defaultSection.classList.remove('hidden');
    }
  }

  handleSaveNode() {
    const idInput = document.getElementById('edit-node-id').value;
    const label = document.getElementById('edit-node-label').value.trim();
    const layer = document.getElementById('edit-node-layer').value;
    const type = document.getElementById('edit-node-type').value;
    const desc = document.getElementById('edit-node-desc').value.trim();

    if (!label || !desc) return alert("필수 항목을 모두 작성하세요.");

    if (idInput) {
      const idx = this.nodes.findIndex(n => n.id === idInput);
      if (idx !== -1) {
        this.nodes[idx] = { ...this.nodes[idx], label, layer, type, desc };
      }
    } else {
      const newId = `MEMBER_${Date.now()}`;
      this.nodes.push({ id: newId, label, layer, type, desc, noteId: null });
    }

    this.syncStorage();
    this.graph.setData(this.nodes, this.links);
    this.renderGlobalNodeList();
    
    this.closeInspectorEditor();
  }

  deleteNode(nodeId) {
    this.nodes = this.nodes.filter(n => n.id !== nodeId);
    this.links = this.links.filter(link => {
      const sId = typeof link.source === 'object' ? link.source.id : link.source;
      const tId = typeof link.target === 'object' ? link.target.id : link.target;
      return sId !== nodeId && tId !== nodeId;
    });

    this.syncStorage();
    this.graph.setData(this.nodes, this.links);
    this.renderGlobalNodeList();
    this.updateDashboardStats();

    document.getElementById('concept-inspector').classList.add('collapsed');
    this.graph.setSelectedNode(null);
  }

  // --- Manual Relation Modal ---
  openAddRelationModal(sourceNodeId) {
    const modal = document.getElementById('relation-modal');
    modal.classList.remove('hidden');

    const sourceSelect = document.getElementById('rel-source-select');
    const targetSelect = document.getElementById('rel-target-select');
    const descInput = document.getElementById('rel-desc');

    descInput.value = "";
    sourceSelect.innerHTML = "";
    targetSelect.innerHTML = "";

    this.nodes.forEach(node => {
      const optSrc = document.createElement('option');
      optSrc.value = node.id;
      optSrc.textContent = `[${node.layer}] ${node.label}`;
      if (node.id === sourceNodeId) optSrc.selected = true;
      sourceSelect.appendChild(optSrc);

      const optTgt = document.createElement('option');
      optTgt.value = node.id;
      optTgt.textContent = `[${node.layer}] ${node.label}`;
      if (node.id !== sourceNodeId) optTgt.selected = true;
      targetSelect.appendChild(optTgt);
    });
  }

  handleSaveRelation() {
    const source = document.getElementById('rel-source-select').value;
    const target = document.getElementById('rel-target-select').value;
    const type = document.getElementById('rel-type').value;
    const desc = document.getElementById('rel-desc').value.trim();

    if (source === target) return alert("자기 자신과는 연결을 맺을 수 없습니다.");
    if (!desc) return alert("관계 매커니즘 설명을 추가하세요.");

    const typeSelect = document.getElementById('rel-type');
    const label = typeSelect.options[typeSelect.selectedIndex].text;

    const newLink = { source, target, type, label, desc, noteId: null };
    this.links.push(newLink);

    this.syncStorage();
    this.graph.setData(this.nodes, this.links);

    document.getElementById('relation-modal').classList.add('hidden');
    
    if (this.graph.selectedNodeId) {
      this.renderNodeRelations(this.graph.selectedNodeId);
    }
  }

  // --- Start Fresh: Clear Database ---
  clearDatabase() {
    this.notes = [];
    this.nodes = [];
    this.links = [];
    
    this.syncStorage();
    this.selectedNoteId = null;
    this.graph.setSelectedNode(null);
    this.graph.highlightNoteId = null;

    this.graph.setData(this.nodes, this.links);
    
    document.getElementById('note-viewer-content').classList.add('hidden');
    document.getElementById('note-viewer-empty').classList.remove('hidden');

    this.renderNotesList();
    this.renderGlobalNodeList();
    this.updateDashboardStats();

    alert("🧹 데이터베이스 초기화 완료! 이제 공부 흐름대로 삼성노트/굿노트 요약을 등록하여 연결망을 처음부터 그려 나가세요.");
  }

  // --- Global Helpers ---
  getNodeLabel(id) {
    const node = this.nodes.find(n => n.id === id) || (this.pendingParsedData && this.pendingParsedData.nodes.find(n => n.id === id));
    return node ? node.label : id;
  }

  renderGlobalNodeList() {
    const listEl = document.getElementById('global-node-list');
    listEl.innerHTML = "";

    const sortBy = document.getElementById('sort-nodes-select').value;
    let sortedNodes = [...this.nodes];
    if (sortBy === 'name') {
      sortedNodes.sort((a, b) => a.label.localeCompare(b.label, 'ko'));
    } else {
      sortedNodes.sort((a, b) => a.layer.localeCompare(b.layer));
    }

    sortedNodes.forEach(node => {
      const item = document.createElement('div');
      item.className = 'node-list-item';
      item.innerHTML = `
        <div class="node-list-info">
          <span class="node-list-label">${node.label}</span>
          <span class="node-list-meta">${node.layer} | ${node.type}</span>
        </div>
        <span class="node-list-dot ${node.layer}"></span>
      `;
      item.addEventListener('click', () => {
        this.onNodeSelected(node);
      });
      listEl.appendChild(item);
    });
  }

  updateDashboardStats() {
    document.getElementById('stat-total-nodes').textContent = this.nodes.length;
    document.getElementById('stat-total-links').textContent = this.links.length;
    
    const reviewNeeded = Math.min(this.links.length, Math.ceil(this.links.length * 0.35));
    document.getElementById('stat-ready-review').textContent = reviewNeeded;
  }

  // --- Quiz Engine Logic ---
  startActiveRecallQuiz() {
    this.quiz = new QuizEngine(
      () => this.nodes,
      () => this.links,
      () => this.showQuizResults()
    );

    const success = this.quiz.generateQuiz();
    if (!success) {
      alert("학습 퀴즈를 생성하려면 최소한 1개 이상의 해부학 노드를 먼저 등록하셔야 합니다.");
      return;
    }
    
    document.getElementById('quiz-start-screen').classList.add('hidden');
    document.getElementById('quiz-result-screen').classList.add('hidden');
    document.getElementById('quiz-play-screen').classList.remove('hidden');

    document.getElementById('btn-next-question').classList.add('hidden');
    document.getElementById('btn-submit-answer').classList.remove('hidden');
    document.getElementById('quiz-feedback').classList.add('hidden');

    this.quiz.startTimer(document.getElementById('timer-val'));
    this.renderQuizQuestion();
  }

  renderQuizQuestion() {
    const q = this.quiz.getCurrentQuestion();
    const progressEl = document.getElementById('quiz-progress-text');
    const qLayerBadge = document.getElementById('quiz-q-layer');
    const qTitle = document.getElementById('quiz-question-title');
    const optionsContainer = document.getElementById('quiz-options-container');

    progressEl.textContent = `문제 ${this.quiz.currentQuestionIdx + 1} / ${this.quiz.questions.length}`;
    qLayerBadge.className = `question-badge node-badge ${q.layer}`;
    qLayerBadge.textContent = `${q.layer}. ${this.getLayerName(q.layer)}`;
    qTitle.textContent = q.title;

    optionsContainer.innerHTML = "";
    q.options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'quiz-option';
      btn.innerHTML = `
        <span>${opt}</span>
        <i data-lucide="check" class="check-mark"></i>
        <i data-lucide="x" class="x-mark hidden"></i>
      `;
      btn.addEventListener('click', () => {
        const options = optionsContainer.querySelectorAll('.quiz-option');
        options.forEach(o => o.classList.remove('selected'));
        btn.classList.add('selected');
      });
      optionsContainer.appendChild(btn);
    });

    lucide.createIcons();
  }

  submitQuizAnswer() {
    const optionsContainer = document.getElementById('quiz-options-container');
    const selectedBtn = optionsContainer.querySelector('.quiz-option.selected');

    if (!selectedBtn) return alert("보기 중 하나를 선택하세요.");

    const selectedVal = selectedBtn.querySelector('span').textContent;
    const isCorrect = this.quiz.submitAnswer(selectedVal);
    const q = this.quiz.getCurrentQuestion();

    const options = optionsContainer.querySelectorAll('.quiz-option');
    options.forEach(btn => {
      btn.disabled = true;
      const val = btn.querySelector('span').textContent;
      
      if (val === q.correctAnswer) {
        btn.classList.add('correct');
        btn.classList.remove('selected');
      } else if (val === selectedVal && !isCorrect) {
        btn.classList.add('incorrect');
        btn.classList.remove('selected');
        btn.querySelector('.x-mark').classList.remove('hidden');
      }
    });

    const feedbackBox = document.getElementById('quiz-feedback');
    feedbackBox.className = `quiz-feedback-box ${isCorrect ? 'correct' : 'incorrect'}`;
    feedbackBox.classList.remove('hidden');

    document.getElementById('feedback-result-title').textContent = isCorrect ? "정답입니다!" : "오답입니다.";
    document.getElementById('feedback-result-desc').textContent = q.explanation;

    document.getElementById('btn-submit-answer').classList.add('hidden');
    document.getElementById('btn-next-question').classList.remove('hidden');

    lucide.createIcons();
  }

  nextQuizQuestion() {
    const feedbackBox = document.getElementById('quiz-feedback');
    feedbackBox.classList.add('hidden');

    const hasNext = this.quiz.nextQuestion();
    if (hasNext) {
      document.getElementById('btn-next-question').classList.add('hidden');
      document.getElementById('btn-submit-answer').classList.remove('hidden');
      this.renderQuizQuestion();
    } else {
      this.showQuizResults();
    }
  }

  showQuizResults() {
    this.quiz.stopTimer();

    document.getElementById('quiz-play-screen').classList.add('hidden');
    document.getElementById('quiz-result-screen').classList.remove('hidden');
    document.getElementById('quiz-score-display').textContent = `${this.quiz.score} / ${this.quiz.questions.length}`;

    const listEl = document.getElementById('quiz-strengthened-nodes');
    listEl.innerHTML = `<h4>강화된 시냅스 결속 고리 (${this.quiz.strengthenedLinks.length}개):</h4>`;

    if (this.quiz.strengthenedLinks.length === 0) {
      listEl.innerHTML += `<p style="font-size:12px; color:var(--text-muted); margin-top:8px;">오늘 퀴즈에서 자가 학습된 시냅스 강화 경로를 개척하지 못했습니다.</p>`;
    } else {
      const ul = document.createElement('ul');
      ul.style.listStyleType = 'none';
      ul.style.marginTop = '10px';
      
      this.quiz.strengthenedLinks.forEach(link => {
        const sName = this.getNodeLabel(link.source);
        const tName = this.getNodeLabel(link.target);
        
        const li = document.createElement('li');
        li.style.fontSize = '12px';
        li.style.color = 'var(--color-success)';
        li.style.marginBottom = '6px';
        li.innerHTML = `✔ <strong>${sName}</strong> ➔ (${link.label}) ➔ <strong>${tName}</strong>`;
        ul.appendChild(li);
      });
      listEl.appendChild(ul);
    }
  }

  exitQuiz() {
    this.quiz.stopTimer();
    this.quiz = null;

    document.getElementById('quiz-play-screen').classList.add('hidden');
    document.getElementById('quiz-result-screen').classList.add('hidden');
    document.getElementById('quiz-start-screen').classList.remove('hidden');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new AppController();
});
