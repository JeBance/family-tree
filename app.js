// ========== Constants ==========
const DB_NAME = 'FamilyTreeDB';
const DB_VERSION = 2;
const STORE_PERSONS = 'persons';
const STORE_RELATIONS = 'relations';
const CANVAS_WIDTH = 10000;
const CANVAS_HEIGHT = 10000;
const CARD_WIDTH = 170;
const CARD_HEIGHT = 140;

// ========== State ==========
let db = null;
let persons = [];
let relations = [];
let currentPhotos = [];
let currentViewPersonId = null;
let currentGalleryIndex = 0;

// Canvas state
let scale = 1;
let translateX = 0;
let translateY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let lastTranslateX = 0;
let lastTranslateY = 0;

// Person drag state
let personDragId = null;
let personDragStartX = 0;
let personDragStartY = 0;

// ========== Database ==========
function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            
            if (!database.objectStoreNames.contains(STORE_PERSONS)) {
                const personsStore = database.createObjectStore(STORE_PERSONS, { keyPath: 'id' });
                personsStore.createIndex('name', 'name', { unique: false });
            }
            
            if (!database.objectStoreNames.contains(STORE_RELATIONS)) {
                const relationsStore = database.createObjectStore(STORE_RELATIONS, { keyPath: 'id' });
                relationsStore.createIndex('person1Id', 'person1Id', { unique: false });
                relationsStore.createIndex('person2Id', 'person2Id', { unique: false });
                relationsStore.createIndex('type', 'type', { unique: false });
            }
        };
    });
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

async function savePerson(person) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_PERSONS], 'readwrite');
        const store = transaction.objectStore(STORE_PERSONS);
        const request = store.put(person);
        request.onsuccess = () => resolve(person);
        request.onerror = () => reject(request.error);
    });
}

async function getPerson(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_PERSONS], 'readonly');
        const store = transaction.objectStore(STORE_PERSONS);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getAllPersons() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_PERSONS], 'readonly');
        const store = transaction.objectStore(STORE_PERSONS);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

async function deletePerson(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_PERSONS, STORE_RELATIONS], 'readwrite');
        const personsStore = transaction.objectStore(STORE_PERSONS);
        const relationsStore = transaction.objectStore(STORE_RELATIONS);
        
        personsStore.delete(id);
        
        const index1 = relationsStore.index('person1Id');
        const index2 = relationsStore.index('person2Id');
        
        index1.openCursor(IDBKeyRange.only(id)).onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
        
        index2.openCursor(IDBKeyRange.only(id)).onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
        
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

async function saveRelation(relation) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_RELATIONS], 'readwrite');
        const store = transaction.objectStore(STORE_RELATIONS);
        const request = store.put(relation);
        request.onsuccess = () => resolve(relation);
        request.onerror = () => reject(request.error);
    });
}

async function deleteRelation(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_RELATIONS], 'readwrite');
        const store = transaction.objectStore(STORE_RELATIONS);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function getAllRelations() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_RELATIONS], 'readonly');
        const store = transaction.objectStore(STORE_RELATIONS);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

async function clearAllData() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_PERSONS, STORE_RELATIONS], 'readwrite');
        const personsStore = transaction.objectStore(STORE_PERSONS);
        const relationsStore = transaction.objectStore(STORE_RELATIONS);
        
        personsStore.clear();
        relationsStore.clear();
        
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

// ========== Utility Functions ==========
function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDatesShort(person) {
    const birth = person.birthDate ? new Date(person.birthDate).getFullYear() : null;
    const death = person.deathDate ? new Date(person.deathDate).getFullYear() : null;
    
    if (!birth && !death) return '';
    if (birth && !death) return 'р. ' + birth;
    if (birth && death) return birth + ' — ' + death;
    return 'ум. ' + death;
}

function formatDatesFull(person) {
    const birth = formatDate(person.birthDate);
    const death = formatDate(person.deathDate);
    
    if (!birth && !death) return 'Даты не указаны';
    if (birth && !death) return 'Родился: ' + birth;
    if (birth && death) return birth + ' — ' + death;
    return 'Умер: ' + death;
}

function getFullName(person) {
    let parts = [];
    if (person.lastName) parts.push(person.lastName);
    if (person.firstName) parts.push(person.firstName);
    if (person.patronymic) parts.push(person.patronymic);
    return parts.length > 0 ? parts.join(' ') : 'Без имени';
}

function getShortName(person) {
    let name = person.firstName || '';
    if (person.lastName) name = person.lastName + ' ' + name;
    return name || 'Без имени';
}

function showToast(message, type) {
    type = type || 'info';
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    document.getElementById('toastContainer').appendChild(toast);
    
    requestAnimationFrame(() => toast.classList.add('show'));
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ========== DOM Elements ==========
const canvasContainer = document.getElementById('canvasContainer');
const canvas = document.getElementById('canvas');
const connectionsLayer = document.getElementById('connectionsLayer');
const personsLayer = document.getElementById('personsLayer');
const emptyState = document.getElementById('emptyState');
const zoomDisplay = document.getElementById('zoomDisplay');

// ========== Canvas Functions ==========
function updateCanvasTransform() {
    canvas.style.transform = 'translate(' + translateX + 'px, ' + translateY + 'px) scale(' + scale + ')';
    zoomDisplay.textContent = Math.round(scale * 100) + '%';
}

function zoomIn() {
    const containerRect = canvasContainer.getBoundingClientRect();
    const centerX = containerRect.width / 2;
    const centerY = containerRect.height / 2;

    const oldScale = scale;
    const newScale = Math.min(2, oldScale + 0.1);

    if (newScale === oldScale) return;

    scale = newScale;
    const scaleFactor = scale / oldScale;

    translateX = centerX - (centerX - translateX) * scaleFactor;
    translateY = centerY - (centerY - translateY) * scaleFactor;

    updateCanvasTransform();
}

function zoomOut() {
    const containerRect = canvasContainer.getBoundingClientRect();
    const centerX = containerRect.width / 2;
    const centerY = containerRect.height / 2;

    const oldScale = scale;
    const newScale = Math.max(0.25, oldScale - 0.1);

    if (newScale === oldScale) return;

    scale = newScale;
    const scaleFactor = scale / oldScale;

    translateX = centerX - (centerX - translateX) * scaleFactor;
    translateY = centerY - (centerY - translateY) * scaleFactor;

    updateCanvasTransform();
}

function centerCanvas() {
    const containerRect = canvasContainer.getBoundingClientRect();
    
    if (persons.length === 0) {
        translateX = -CANVAS_WIDTH / 2 + containerRect.width / 2;
        translateY = -CANVAS_HEIGHT / 2 + containerRect.height / 2;
        scale = 1;
    } else {
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        
        persons.forEach(p => {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x + CARD_WIDTH);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y + CARD_HEIGHT);
        });
        
        const contentCenterX = (minX + maxX) / 2;
        const contentCenterY = (minY + maxY) / 2;
        
        translateX = containerRect.width / 2 - contentCenterX * scale;
        translateY = containerRect.height / 2 - contentCenterY * scale;
    }
    
    updateCanvasTransform();
}

// ========== Render Functions ==========
function renderPersonCard(person) {
    const genderClass = person.gender || '';
    const dates = formatDatesShort(person);
    const photos = person.photos || [];
    const hasMultiplePhotos = photos.length > 1;
    
    let avatarContent = '';
    if (photos.length > 0 && photos[0].data) {
        avatarContent = '<img src="' + photos[0].data + '" alt="' + getFullName(person) + '">';
    } else {
        avatarContent = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    }
    
    return '<div class="person-card ' + genderClass + '" data-id="' + person.id + '" style="left: ' + person.x + 'px; top: ' + person.y + 'px;">' +
        '<div class="person-avatar">' +
            avatarContent +
            (hasMultiplePhotos ? '<span class="photo-count">' + photos.length + '</span>' : '') +
        '</div>' +
        '<div class="person-info">' +
            '<div class="person-name">' + getShortName(person) + '</div>' +
            (dates ? '<div class="person-dates">' + dates + '</div>' : '') +
        '</div>' +
        '<div class="person-actions">' +
            '<button class="btn" onclick="openViewModal(\'' + person.id + '\')" title="Просмотр">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
            '</button>' +
            '<button class="btn" onclick="openEditPerson(\'' + person.id + '\')" title="Редактировать">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
            '</button>' +
            '<button class="btn" onclick="openRelations(\'' + person.id + '\')" title="Связи">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></svg>' +
            '</button>' +
            '<button class="btn" onclick="deletePersonConfirm(\'' + person.id + '\')" title="Удалить">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
            '</button>' +
        '</div>' +
    '</div>';
}

function renderConnections() {
    if (relations.length === 0 || persons.length === 0) {
        connectionsLayer.innerHTML = '';
        return;
    }
    
    const personMap = new Map();
    persons.forEach(p => personMap.set(p.id, p));
    
    let svgContent = '';
    
    relations.filter(r => r.type === 'parent').forEach(relation => {
        const parent = personMap.get(relation.person1Id);
        const child = personMap.get(relation.person2Id);
        
        if (parent && child) {
            const x1 = parent.x + CARD_WIDTH / 2;
            const y1 = parent.y + CARD_HEIGHT;
            const x2 = child.x + CARD_WIDTH / 2;
            const y2 = child.y;
            
            const midY = (y1 + y2) / 2;
            
            svgContent += '<path d="M' + x1 + ',' + y1 + ' Q' + x1 + ',' + midY + ' ' + (x1 + x2)/2 + ',' + midY + ' Q' + x2 + ',' + midY + ' ' + x2 + ',' + y2 + '" stroke="#6b8a72" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.7"/>';
        }
    });
    
    relations.filter(r => r.type === 'spouse').forEach(relation => {
        const spouse1 = personMap.get(relation.person1Id);
        const spouse2 = personMap.get(relation.person2Id);
        
        if (spouse1 && spouse2) {
            const leftSpouse = spouse1.x < spouse2.x ? spouse1 : spouse2;
            const rightSpouse = spouse1.x < spouse2.x ? spouse2 : spouse1;
            
            const lineX1 = leftSpouse.x + CARD_WIDTH;
            const lineX2 = rightSpouse.x;
            const lineY = leftSpouse.y + 55;
            
            svgContent += '<line x1="' + lineX1 + '" y1="' + lineY + '" x2="' + lineX2 + '" y2="' + lineY + '" stroke="#c9a66b" stroke-width="2" stroke-dasharray="8,4" opacity="0.8"/>';
            
            const midX = (lineX1 + lineX2) / 2;
            svgContent += '<circle cx="' + midX + '" cy="' + lineY + '" r="4" fill="#c9a66b" opacity="0.8"/>';
        }
    });
    
    connectionsLayer.innerHTML = svgContent;
}

async function render() {
    persons = await getAllPersons();
    relations = await getAllRelations();
    
    emptyState.style.display = persons.length === 0 ? 'flex' : 'none';
    personsLayer.style.display = persons.length === 0 ? 'none' : 'block';
    
    if (persons.length > 0) {
        personsLayer.innerHTML = persons.map(renderPersonCard).join('');
        renderConnections();
        initPersonDrag();
    } else {
        connectionsLayer.innerHTML = '';
    }
}

// ========== Person Drag ==========
function initPersonDrag() {
    const cards = personsLayer.querySelectorAll('.person-card');
    
    cards.forEach(card => {
        card.addEventListener('mousedown', startPersonDrag);
        card.addEventListener('touchstart', startPersonDrag, { passive: false });
        card.addEventListener('contextmenu', showContextMenu);
    });
}

function startPersonDrag(e) {
    if (e.target.closest('.person-actions')) return;
    if (e.button === 2) return;
    
    const card = e.target.closest('.person-card');
    if (!card) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    personDragId = card.dataset.id;
    card.classList.add('dragging');
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    personDragStartX = clientX;
    personDragStartY = clientY;
    
    document.addEventListener('mousemove', dragPerson);
    document.addEventListener('mouseup', endPersonDrag);
    document.addEventListener('touchmove', dragPerson, { passive: false });
    document.addEventListener('touchend', endPersonDrag);
}

function dragPerson(e) {
    if (!personDragId) return;
    
    e.preventDefault();
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const dx = (clientX - personDragStartX) / scale;
    const dy = (clientY - personDragStartY) / scale;
    
    const card = personsLayer.querySelector('[data-id="' + personDragId + '"]');
    if (card) {
        const person = persons.find(p => p.id === personDragId);
        if (person) {
            const newX = person.x + dx;
            const newY = person.y + dy;
            card.style.left = newX + 'px';
            card.style.top = newY + 'px';
        }
    }
}

async function endPersonDrag() {
    if (!personDragId) return;
    
    const card = personsLayer.querySelector('[data-id="' + personDragId + '"]');
    if (card) {
        card.classList.remove('dragging');
        
        const newX = parseInt(card.style.left) || 0;
        const newY = parseInt(card.style.top) || 0;
        
        const person = persons.find(p => p.id === personDragId);
        if (person) {
            person.x = newX;
            person.y = newY;
            await savePerson(person);
            renderConnections();
        }
    }
    
    personDragId = null;
    
    document.removeEventListener('mousemove', dragPerson);
    document.removeEventListener('mouseup', endPersonDrag);
    document.removeEventListener('touchmove', dragPerson);
    document.removeEventListener('touchend', endPersonDrag);
}

// ========== Canvas Pan ==========
canvasContainer.addEventListener('mousedown', startCanvasPan);
canvasContainer.addEventListener('touchstart', startCanvasPan, { passive: false });

function startCanvasPan(e) {
    if (e.target.closest('.person-card')) return;
    
    isDragging = true;
    canvasContainer.style.cursor = 'grabbing';
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    dragStartX = clientX;
    dragStartY = clientY;
    lastTranslateX = translateX;
    lastTranslateY = translateY;
    
    document.addEventListener('mousemove', dragCanvas);
    document.addEventListener('mouseup', endCanvasPan);
    document.addEventListener('touchmove', dragCanvas, { passive: false });
    document.addEventListener('touchend', endCanvasPan);
}

function dragCanvas(e) {
    if (!isDragging) return;
    
    e.preventDefault();
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    translateX = lastTranslateX + (clientX - dragStartX);
    translateY = lastTranslateY + (clientY - dragStartY);
    
    updateCanvasTransform();
}

function endCanvasPan() {
    isDragging = false;
    canvasContainer.style.cursor = 'grab';
    
    document.removeEventListener('mousemove', dragCanvas);
    document.removeEventListener('mouseup', endCanvasPan);
    document.removeEventListener('touchmove', dragCanvas);
    document.removeEventListener('touchend', endCanvasPan);
}

canvasContainer.addEventListener('wheel', (e) => {
    e.preventDefault();

    const rect = canvasContainer.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const oldScale = scale;
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    const newScale = Math.min(2, Math.max(0.25, oldScale + delta));

    if (newScale === oldScale) return;

    scale = newScale;

    const scaleFactor = scale / oldScale;

    translateX = mouseX - (mouseX - translateX) * scaleFactor;
    translateY = mouseY - (mouseY - translateY) * scaleFactor;

    updateCanvasTransform();
}, { passive: false });

// ========== Context Menu ==========
let contextMenuPersonId = null;

function showContextMenu(e) {
    e.preventDefault();
    
    const card = e.target.closest('.person-card');
    if (!card) return;
    
    contextMenuPersonId = card.dataset.id;
    
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    contextMenu.classList.add('active');
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.context-menu')) {
        contextMenu.classList.remove('active');
    }
});

contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
    item.addEventListener('click', () => {
        const action = item.dataset.action;
        
        if (action === 'view') {
            openViewModal(contextMenuPersonId);
        } else if (action === 'edit') {
            openEditPerson(contextMenuPersonId);
        } else if (action === 'relations') {
            openRelations(contextMenuPersonId);
        } else if (action === 'delete') {
            deletePersonConfirm(contextMenuPersonId);
        }
        
        contextMenu.classList.remove('active');
    });
});

// ========== Person Edit Modal ==========
const personModal = document.getElementById('personModal');
const personModalTitle = document.getElementById('personModalTitle');
const personIdInput = document.getElementById('personId');
const lastNameInput = document.getElementById('lastName');
const firstNameInput = document.getElementById('firstName');
const patronymicInput = document.getElementById('patronymic');
const maidenNameInput = document.getElementById('maidenName');
const birthDateInput = document.getElementById('birthDate');
const deathDateInput = document.getElementById('deathDate');
const genderInput = document.getElementById('gender');
const notesInput = document.getElementById('notes');
const photoInput = document.getElementById('photoInput');
const photosGrid = document.getElementById('photosGrid');

function openPersonModal(person) {
    person = person || null;
    personModalTitle.textContent = person ? 'Редактировать' : 'Добавить члена семьи';
    
    personIdInput.value = person ? person.id : '';
    lastNameInput.value = person ? (person.lastName || '') : '';
    firstNameInput.value = person ? (person.firstName || '') : '';
    patronymicInput.value = person ? (person.patronymic || '') : '';
    maidenNameInput.value = person ? (person.maidenName || '') : '';
    birthDateInput.value = person ? (person.birthDate || '') : '';
    deathDateInput.value = person ? (person.deathDate || '') : '';
    genderInput.value = person ? (person.gender || '') : '';
    notesInput.value = person ? (person.notes || '') : '';
    
    currentPhotos = person && person.photos ? JSON.parse(JSON.stringify(person.photos)) : [];
    
    renderPhotosGrid();
    
    personModal.classList.add('active');
    firstNameInput.focus();
}

function closePersonModal() {
    personModal.classList.remove('active');
    currentPhotos = [];
}

function renderPhotosGrid() {
    let html = '';

    currentPhotos.forEach((photo, index) => {
        const isMain = index === 0;
        html += '<div class="photo-item ' + (isMain ? 'main' : '') + '" data-index="' + index + '">' +
            '<img src="' + photo.data + '" alt="Фото">' +
            '<button class="photo-delete" onclick="deletePhoto(' + index + ', event)" title="Удалить">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                    '<line x1="18" y1="6" x2="6" y2="18"/>' +
                    '<line x1="6" y1="6" x2="18" y2="18"/>' +
                '</svg>' +
            '</button>' +
            (isMain ? '<span class="photo-main-badge">Основное</span>' : '') +
            (!isMain ? '<button class="photo-set-main" onclick="setPhotoAsMain(' + index + ', event)" title="Сделать основным">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                    '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>' +
                '</svg>' +
            '</button>' : '') +
            '<div class="photo-caption-input">' +
                '<input type="text" value="' + (photo.caption || '') + '" placeholder="Подпись..." onchange="updatePhotoCaption(' + index + ', this.value)">' +
            '</div>' +
        '</div>';
    });

    html += '<label class="photo-add-btn" id="addPhotoBtn">' +
        '<input type="file" accept="image/*" id="photoInputNew" hidden>' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<line x1="12" y1="5" x2="12" y2="19"/>' +
            '<line x1="5" y1="12" x2="19" y2="12"/>' +
        '</svg>' +
        '<span>Добавить</span>' +
    '</label>';

    photosGrid.innerHTML = html;

    // Re-attach event listener
    const newPhotoInput = document.getElementById('photoInputNew');
    if (newPhotoInput) {
        newPhotoInput.addEventListener('change', handlePhotoUpload);
    }
}

window.deletePhoto = function(index, event) {
    event.stopPropagation();
    currentPhotos.splice(index, 1);
    renderPhotosGrid();
};

window.updatePhotoCaption = function(index, value) {
    if (currentPhotos[index]) {
        currentPhotos[index].caption = value;
    }
};

window.setPhotoAsMain = function(index, event) {
    event.stopPropagation();
    if (index === 0) return;
    
    // Перемещаем выбранное фото на первую позицию
    const photo = currentPhotos.splice(index, 1)[0];
    currentPhotos.unshift(photo);
    renderPhotosGrid();
};

function handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        currentPhotos.push({
            id: generateId(),
            data: event.target.result,
            caption: ''
        });
        renderPhotosGrid();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

photoInput.addEventListener('change', handlePhotoUpload);

window.openEditPerson = async function(id) {
    const person = await getPerson(id);
    if (person) {
        openPersonModal(person);
    }
};

async function savePersonFromModal() {
    const firstName = firstNameInput.value.trim();
    if (!firstName) {
        showToast('Введите имя', 'error');
        return;
    }
    
    const id = personIdInput.value || generateId();
    const existingPerson = persons.find(p => p.id === id);
    
    const containerRect = canvasContainer.getBoundingClientRect();
    let initialX, initialY;
    if (existingPerson) {
        initialX = existingPerson.x;
        initialY = existingPerson.y;
    } else {
        initialX = (containerRect.width / 2 - translateX) / scale - CARD_WIDTH / 2;
        initialY = (containerRect.height / 2 - translateY) / scale - CARD_HEIGHT / 2;
    }
    
    const person = {
        id: id,
        lastName: lastNameInput.value.trim(),
        firstName: firstName,
        patronymic: patronymicInput.value.trim(),
        maidenName: maidenNameInput.value.trim(),
        birthDate: birthDateInput.value,
        deathDate: deathDateInput.value,
        gender: genderInput.value,
        notes: notesInput.value.trim(),
        photos: currentPhotos,
        x: initialX,
        y: initialY,
        createdAt: existingPerson ? existingPerson.createdAt : Date.now(),
        updatedAt: Date.now()
    };
    
    await savePerson(person);
    closePersonModal();
    await render();
    showToast('Сохранено', 'success');
}

window.deletePersonConfirm = async function(id) {
    if (confirm('Удалить этого человека и все его связи?')) {
        await deletePerson(id);
        await render();
        showToast('Удалено', 'success');
    }
};

// ========== View Modal ==========
const viewModal = document.getElementById('viewModal');
const viewModalBody = document.getElementById('viewModalBody');

window.openViewModal = async function(id) {
    const person = await getPerson(id);
    if (!person) return;
    
    currentViewPersonId = id;
    const photos = person.photos || [];
    const mainPhoto = photos.length > 0 ? photos[0] : null;
    const archivePhotos = photos.slice(1);
    
    let html = '<div class="view-header">' +
        '<div class="view-photo">';
    
    if (mainPhoto) {
        html += '<img src="' + mainPhoto.data + '" alt="' + getFullName(person) + '">';
    } else {
        html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    }
    
    html += '</div>' +
        '<div class="view-name">' + getFullName(person) + '</div>' +
        '<div class="view-dates">' + formatDatesFull(person) + '</div>';
    
    if (archivePhotos.length > 0) {
        html += '<button class="view-gallery-btn" onclick="openGalleryModal()">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>' +
            'Архив фотографий (' + archivePhotos.length + ')' +
        '</button>';
    }
    
    html += '</div>' +
        '<div class="view-content">';
    
    // Info section
    if (person.maidenName || person.gender) {
        html += '<div class="view-section">' +
            '<div class="view-info-grid">';
        
        if (person.maidenName) {
            html += '<div class="view-info-item">' +
                '<div class="view-info-label">Девичья фамилия</div>' +
                '<div class="view-info-value">' + person.maidenName + '</div>' +
            '</div>';
        }
        
        if (person.gender) {
            html += '<div class="view-info-item">' +
                '<div class="view-info-label">Пол</div>' +
                '<div class="view-info-value">' + (person.gender === 'male' ? 'Мужской' : 'Женский') + '</div>' +
            '</div>';
        }
        
        html += '</div></div>';
    }
    
    // Notes section
    html += '<div class="view-section">' +
        '<div class="view-section-title">Биография</div>';
    
    if (person.notes) {
        html += '<div class="view-notes">' + person.notes + '</div>';
    } else {
        html += '<div class="view-notes view-notes-empty">Биография не указана</div>';
    }
    
    html += '</div></div>';
    
    viewModalBody.innerHTML = html;
    viewModal.classList.add('active');
};

function closeViewModal() {
    viewModal.classList.remove('active');
    currentViewPersonId = null;
}

document.getElementById('viewModalClose').addEventListener('click', closeViewModal);
document.getElementById('viewModalClose2').addEventListener('click', closeViewModal);
document.getElementById('viewModalEdit').addEventListener('click', () => {
    closeViewModal();
    openEditPerson(currentViewPersonId);
});

viewModal.addEventListener('click', (e) => {
    if (e.target === viewModal) closeViewModal();
});

// ========== Gallery Modal ==========
const galleryModal = document.getElementById('galleryModal');
const galleryContainer = document.getElementById('galleryContainer');
const galleryModalTitle = document.getElementById('galleryModalTitle');

window.openGalleryModal = function() {
    const person = persons.find(p => p.id === currentViewPersonId);
    if (!person) return;
    
    const photos = (person.photos || []).slice(1);
    if (photos.length === 0) return;
    
    currentGalleryIndex = 0;
    galleryModalTitle.textContent = 'Архив: ' + getFullName(person);
    
    renderGallery(photos);
    galleryModal.classList.add('active');
};

function renderGallery(photos) {
    const photo = photos[currentGalleryIndex];
    if (!photo) return;
    
    let html = '<div class="gallery-main">' +
        '<img src="' + photo.data + '" alt="">' +
        (photo.caption ? '<div class="gallery-main-caption">' + photo.caption + '</div>' : '') +
    '</div>' +
    '<div class="gallery-nav">' +
        '<button class="gallery-nav-btn" onclick="galleryPrev()" ' + (currentGalleryIndex === 0 ? 'disabled style="opacity:0.3"' : '') + '>' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>' +
        '</button>' +
        '<div class="gallery-counter">' + (currentGalleryIndex + 1) + ' / ' + photos.length + '</div>' +
        '<button class="gallery-nav-btn" onclick="galleryNext()" ' + (currentGalleryIndex === photos.length - 1 ? 'disabled style="opacity:0.3"' : '') + '>' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>' +
        '</button>' +
    '</div>' +
    '<div class="gallery-thumbs">';
    
    photos.forEach((p, i) => {
        html += '<div class="gallery-thumb ' + (i === currentGalleryIndex ? 'active' : '') + '" onclick="galleryGoTo(' + i + ')">' +
            '<img src="' + p.data + '" alt="">' +
        '</div>';
    });
    
    html += '</div>';
    
    galleryContainer.innerHTML = html;
}

window.galleryPrev = function() {
    const person = persons.find(p => p.id === currentViewPersonId);
    if (!person) return;
    const photos = (person.photos || []).slice(1);
    if (currentGalleryIndex > 0) {
        currentGalleryIndex--;
        renderGallery(photos);
    }
};

window.galleryNext = function() {
    const person = persons.find(p => p.id === currentViewPersonId);
    if (!person) return;
    const photos = (person.photos || []).slice(1);
    if (currentGalleryIndex < photos.length - 1) {
        currentGalleryIndex++;
        renderGallery(photos);
    }
};

window.galleryGoTo = function(index) {
    const person = persons.find(p => p.id === currentViewPersonId);
    if (!person) return;
    const photos = (person.photos || []).slice(1);
    currentGalleryIndex = index;
    renderGallery(photos);
};

function closeGalleryModal() {
    galleryModal.classList.remove('active');
}

document.getElementById('galleryModalClose').addEventListener('click', closeGalleryModal);
galleryModal.addEventListener('click', (e) => {
    if (e.target === galleryModal) closeGalleryModal();
});

// ========== Relations Modal ==========
const relationsModal = document.getElementById('relationsModal');
const relationsPersonName = document.getElementById('relationsPersonName');
const relationsPersonIdInput = document.getElementById('relationsPersonId');
const parentsList = document.getElementById('parentsList');
const childrenList = document.getElementById('childrenList');
const spouseList = document.getElementById('spouseList');

window.openRelations = async function(id) {
    const person = await getPerson(id);
    if (!person) return;
    
    relationsPersonIdInput.value = id;
    relationsPersonName.textContent = getFullName(person);
    
    const currentRelations = relations.filter(r => 
        r.person1Id === id || r.person2Id === id
    );
    
    const parents = currentRelations
        .filter(r => r.type === 'parent' && r.person2Id === id)
        .map(r => r.person1Id);
    
    const children = currentRelations
        .filter(r => r.type === 'parent' && r.person1Id === id)
        .map(r => r.person2Id);
    
    const spouse = currentRelations.find(r => r.type === 'spouse');
    const spouseId = spouse ? (spouse.person1Id === id ? spouse.person2Id : spouse.person1Id) : null;
    
    const otherPersons = persons.filter(p => p.id !== id);
    
    parentsList.innerHTML = renderRelationList(otherPersons, parents, true);
    childrenList.innerHTML = renderRelationList(otherPersons, children, true);
    spouseList.innerHTML = renderRelationList(otherPersons, spouseId ? [spouseId] : [], false);
    
    relationsModal.classList.add('active');
};

function renderRelationList(personsList, selectedIds, multiSelect) {
    if (personsList.length === 0) {
        return '<p style="padding: 16px; text-align: center; color: var(--fg-muted);">Нет доступных персон</p>';
    }
    
    return personsList.map(p => {
        const isSelected = selectedIds.includes(p.id);
        const photos = p.photos || [];
        let avatarContent = '';
        
        if (photos.length > 0 && photos[0].data) {
            avatarContent = '<img src="' + photos[0].data + '" alt="">';
        } else {
            avatarContent = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
        }
        
        return '<div class="relation-item ' + (isSelected ? 'selected' : '') + '" data-id="' + p.id + '" data-multi="' + multiSelect + '">' +
            '<div class="relation-avatar">' + avatarContent + '</div>' +
            '<div class="relation-info">' +
                '<div class="relation-name">' + getFullName(p) + '</div>' +
                '<div class="relation-dates">' + formatDatesShort(p) + '</div>' +
            '</div>' +
        '</div>';
    }).join('');
}

document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        const tabName = tab.dataset.tab;
        document.querySelectorAll('.tab-content').forEach(content => {
            content.style.display = 'none';
        });
        document.getElementById('tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1)).style.display = 'block';
    });
});

[parentsList, childrenList, spouseList].forEach(list => {
    list.addEventListener('click', (e) => {
        const item = e.target.closest('.relation-item');
        if (!item) return;
        
        const multiSelect = item.dataset.multi === 'true';
        
        if (multiSelect) {
            item.classList.toggle('selected');
        } else {
            list.querySelectorAll('.relation-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
        }
    });
});

async function saveRelations() {
    const personId = relationsPersonIdInput.value;
    
    const oldRelations = relations.filter(r => 
        r.person1Id === personId || r.person2Id === personId
    );
    for (const r of oldRelations) {
        await deleteRelation(r.id);
    }
    
    const selectedParents = Array.from(parentsList.querySelectorAll('.relation-item.selected'))
        .map(item => item.dataset.id);
    
    for (const parentId of selectedParents) {
        await saveRelation({
            id: generateId(),
            type: 'parent',
            person1Id: parentId,
            person2Id: personId
        });
    }
    
    const selectedChildren = Array.from(childrenList.querySelectorAll('.relation-item.selected'))
        .map(item => item.dataset.id);
    
    for (const childId of selectedChildren) {
        await saveRelation({
            id: generateId(),
            type: 'parent',
            person1Id: personId,
            person2Id: childId
        });
    }
    
    const selectedSpouse = spouseList.querySelector('.relation-item.selected');
    if (selectedSpouse) {
        await saveRelation({
            id: generateId(),
            type: 'spouse',
            person1Id: personId,
            person2Id: selectedSpouse.dataset.id
        });
    }
    
    closeRelationsModal();
    await render();
    showToast('Связи сохранены', 'success');
}

function closeRelationsModal() {
    relationsModal.classList.remove('active');
}

// ========== Import/Export ==========
document.getElementById('exportBtn').addEventListener('click', async () => {
    const data = {
        version: 2,
        exportDate: new Date().toISOString(),
        persons: persons,
        relations: relations
    };
    
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'family-tree-' + new Date().toISOString().split('T')[0] + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Данные экспортированы', 'success');
});

document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
});

document.getElementById('importFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        if (!data.persons || !Array.isArray(data.persons)) {
            throw new Error('Неверный формат файла');
        }
        
        if (!confirm('Импорт заменит все текущие данные. Продолжить?')) {
            return;
        }
        
        await clearAllData();
        
        for (const person of data.persons) {
            await savePerson(person);
        }
        
        if (data.relations && Array.isArray(data.relations)) {
            for (const relation of data.relations) {
                await saveRelation(relation);
            }
        }
        
        await render();
        centerCanvas();
        showToast('Импортировано ' + data.persons.length + ' персон', 'success');
        
    } catch (err) {
        showToast('Ошибка импорта: ' + err.message, 'error');
    }
    
    e.target.value = '';
});

// ========== Event Listeners ==========
document.getElementById('addPersonBtn').addEventListener('click', () => openPersonModal());
document.getElementById('addFirstPersonBtn').addEventListener('click', () => openPersonModal());
document.getElementById('personModalSave').addEventListener('click', savePersonFromModal);
document.getElementById('personModalCancel').addEventListener('click', closePersonModal);
document.getElementById('personModalClose').addEventListener('click', closePersonModal);

document.getElementById('relationsModalSave').addEventListener('click', saveRelations);
document.getElementById('relationsModalCancel').addEventListener('click', closeRelationsModal);
document.getElementById('relationsModalClose').addEventListener('click', closeRelationsModal);

document.getElementById('zoomInBtn').addEventListener('click', zoomIn);
document.getElementById('zoomOutBtn').addEventListener('click', zoomOut);
document.getElementById('centerBtn').addEventListener('click', centerCanvas);

personModal.addEventListener('click', (e) => {
    if (e.target === personModal) closePersonModal();
});
relationsModal.addEventListener('click', (e) => {
    if (e.target === relationsModal) closeRelationsModal();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeGalleryModal();
        closeViewModal();
        closePersonModal();
        closeRelationsModal();
        contextMenu.classList.remove('active');
    }
});

document.getElementById('helpBtn').addEventListener('click', () => {
    alert('Семейное Древо\n\n' +
        '• Добавляйте членов семьи кнопкой "Добавить"\n' +
        '• Перетаскивайте карточки для размещения\n' +
        '• Нажмите на карточку правой кнопкой для контекстного меню\n' +
        '• Используйте колесо мыши для масштабирования\n' +
        '• Кнопка "Просмотр" открывает профиль персоны\n' +
        '• Экспортируйте данные для резервного копирования\n' +
        '• Данные сохраняются локально в вашем браузере');
});

// ========== PWA Install ==========
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('installBanner').classList.add('show');
});

document.getElementById('installBtn').addEventListener('click', async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const result = await deferredPrompt.userChoice;
        if (result.outcome === 'accepted') {
            showToast('Приложение установлено!', 'success');
        }
        deferredPrompt = null;
        document.getElementById('installBanner').classList.remove('show');
    }
});

// ========== Service Worker ==========
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js').catch(function(err) {
            console.log('ServiceWorker registration failed:', err);
        });
    });
}

// ========== Init ==========
async function init() {
    await openDatabase();
    await render();
    centerCanvas();
}

init();
