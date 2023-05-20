
// storage wrapper since i've already moved from localstorage to indexeddb
const store = (table, obj, key = undefined) => {
  storeinDB(table, obj, key);
};
const retrieve = (table, key) => {
  return retrieveFromDB(table, key);
};


const dbOperation = (table) => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("pokemonDB", 1);
    request.onerror = function(event) {
      console.error(event);
      reject(event);
    };
    request.onsuccess = function(event) {
      const db = event.target.result;
      const transaction = db.transaction([table], "readwrite");
      const objectStore = transaction.objectStore(table);
      resolve(objectStore);
    };
    request.onupgradeneeded = function(event) {
      const db = event.target.result;
      db.createObjectStore('pokemonList');
      db.createObjectStore('moveList');
      db
        .createObjectStore('pokemon', { keyPath: "name" })
        .createIndex("name", "name", { unique: true });
      db
        .createObjectStore('species', { keyPath: "name" })
        .createIndex("name", "name", { unique: true });
      db
        .createObjectStore('move', { keyPath: "name" })
        .createIndex("name", "name", { unique: true });
      db
        .createObjectStore('learnMethod', { keyPath: "name" })
        .createIndex("name", "name", { unique: true });
      db
        .createObjectStore('generation', { keyPath: "name" })
        .createIndex("name", "name", { unique: true });
      db
        .createObjectStore('version', { keyPath: "name" })
        .createIndex("name", "name", { unique: true });
    };
  });
};
const storeinDB = (table, obj, key = undefined) => {
  return dbOperation(table).then((objectStore) => {
    return new Promise((resolve, reject) => {
      const request = objectStore.add(obj, key);
      request.onsuccess = function(event) {
        resolve(event);
      };
    });
  });
};
const clearDB = () => {
  indexedDB.deleteDatabase('pokemonDB');
};
const retrieveFromDB = (table, key) => {
  return dbOperation(table).then((objectStore) => {
    return new Promise((resolve, reject) => {
      const request = objectStore.get(key);
      request.onsuccess = function(event) {
        resolve(event.target.result);
      };
    });
  });
};

// Glob of helper functions for retrieving data from cache and/or PokeAPI.

const urlMap = {
  'pokemon': 'https://pokeapi.co/api/v2/pokemon/',
  'species': 'https://pokeapi.co/api/v2/pokemon-species/',
  'move': 'https://pokeapi.co/api/v2/move/',
  'learnMethod': 'https://pokeapi.co/api/v2/move-learn-method/',
  'generation': 'https://pokeapi.co/api/v2/version-group/',
  'version': 'https://pokeapi.co/api/v2/version/',
};

const fetchList = (baseUrl, offset = 0) => {
  const url = `${baseUrl}?limit=100&offset=${offset}`;
  return fetch(url).then((resp) => {
    return resp.json();
  }).then((obj) => {
    if (obj.next) {
      return fetchList(baseUrl, offset + 100).then((nextObj) => {
        return obj.results.concat(nextObj);
      });
    }
    return obj.results;
  });
};

const getPokemonList = async () => {
  const cached = await retrieve('pokemonList', 'list');
  if (cached) return Promise.resolve(cached);
  return fetchPokemonList().then((list) => {
    store('pokemonList', list, 'list');
    return list;
  });
};

const fetchPokemonList = () => {
  return fetchList('https://pokeapi.co/api/v2/pokemon');
};

const getAllMoves = async () => {
  const cached = await retrieve('moveList', 'list');
  if (cached) return Promise.resolve(cached);
  return fetchMoveList().then((list) => {
    store('moveList', list, 'list');
    return list;
  });
};

const fetchMoveList = () => {
  return fetchList('https://pokeapi.co/api/v2/move');
};

const genericGet = async (table, name) => {
  const cached = await retrieve(table, name);
  if (cached) return Promise.resolve(cached);
  return genericFetch(table, name).then((obj) => {
    if (obj) store(table, obj);
    return obj;
  });
};
const genericFetch = (table, name) => {
  if (!urlMap[table]) throw new Error(`No url for table ${table}`);
  const url = `${urlMap[table]}${name}`;
  return fetch(url).then((resp) => {
    return resp.json();
  }).catch((e) => {
    console.error('error fetching', url, e);
    return null;
  })
};

const getPokemon = (name) => genericGet('pokemon', name);
const getSpecies = (name) => genericGet('species', name);
const getMove = (name) => genericGet('move', name);
const getLearnMethod = (name) => genericGet('learnMethod', name);
const getGeneration = (name) => genericGet('generation', name);
const getGame = (name) => genericGet('version', name);

// Pokemon data retrievers

const getMovesByGen = async (name) => {
  const pokemon = await getPokemon(name);
  const movesByGame = {};
  const allMoves = pokemon.moves.concat(addedMoves);
  await Promise.all(allMoves.map(async (move) => {
    return new Promise(async (resolve, reject) => {
      const moveData = await getMove(move.move.name);
      move.version_group_details.forEach((detail) => {
        const game = detail.version_group.name;
        const method = detail.move_learn_method.name;
        movesByGame[game] = movesByGame[game] || {};
        movesByGame[game][method] = movesByGame[game][method] || [];
        movesByGame[game][method].push({
          move: moveData,
          level: detail.level_learned_at || null,
          added: detail.added || false,
        });
        movesByGame[game][method].sort((a, b) => {
          if (a.level && b.level && a.level != b.level) return a.level - b.level;
          else if (a.move.name < b.move.name) return -1;
          else if (a.move.name > b.move.name) return 1;
          else return 0;
        });
      });
      resolve();
    });
  }));
  return movesByGame;
};

const getDisplayName = (obj, lang = "en") => {
  const localized = obj.names.find((n) => n.language.name === lang);
  return localized.name;
};

const getPokemonDisplayName = async (name, lang = "en") => {
  const pokemon = await getPokemon(name);
  const species = await getSpecies(pokemon.species.name);
  return getDisplayName(species, lang);
};

const getLearnMethodDisplayName = async (name, lang = "en") => {
  return getDisplayName(await getLearnMethod(name), lang);
};

const getGenerationDisplayName = async (name, lang = "en") => {
  const generation = await getGeneration(name);
  return Promise.all(generation.versions.map((version) => {
    return getGame(version.name);
  })).then((games) => {
    return games.map((game) => {
      return getDisplayName(game, lang);
    }).join('/');
  });
};

const getMoveDisplayName = async (name, lang = "en") => {
  return getDisplayName(await getMove(name), lang);
};


// DOM helpers.

// set a value in the url hash
const setUrlPart = (part, value, append = false) => {
  const parsedHash = new URLSearchParams(window.location.hash.substring(1));
  if (append) {
    parsedHash.append(part, value);
  } else {
    parsedHash.set(part, value);
  }
  window.location.hash = parsedHash.toString();
};

// remove all url parts with the key
const removeUrlPart = (part) => {
  const parsedHash = new URLSearchParams(window.location.hash.substring(1));
  while (parsedHash.has(part)) {
    parsedHash.delete(part);
  }
  window.location.hash = parsedHash.toString();
};

const resetUrlParts = () => {
  removeUrlPart('poke');
  removeUrlPart('gen');
  removeUrlPart('r');
  removeUrlPart('a');
  if (selectedPokemon) setUrlPart('poke', selectedPokemon.name);
  if (selectedGame) setUrlPart('gen', selectedGame);
  removedMoves.forEach((move) => {
    setUrlPart('r', move, true);
  });
  addedMoves.forEach((move) => {
    addMoveToUrl(
      move.move.name,
      move.version_group_details[0].move_learn_method.name,
      move.version_group_details[0].level_learned_at);
  });
};

let selectedPokemon = null;
// Used on user input in pokemon name field and when parsing name from URL.
const checkName = (name) => {
  if (name === '') {
    return;
  }
  return getPokemonList().then((pokemonList) => {
    const pokemon = pokemonList.find((p) => p.name === name);
    if (pokemon) {
      console.log('so you have chosen', pokemon);
      setUrlPart('poke', pokemon.name);
      // window.location.href = `#poke=${pokemon.name}`;
      getPokemon(pokemon.name).then((pokemon) => {
        console.log(pokemon);
        selectedPokemon = pokemon;
        updatePokemon();
      });
    }
  });
};

const displayTypes = (pokemon) => {
  const type1 = document.getElementById('pokemon-type-1');
  let pokeType = pokemon.types[0].type.name;
  type1.textContent = pokeType;
  type1.setAttribute('data-type', pokeType);
  const type2 = document.getElementById('pokemon-type-2');
  if (pokemon.types.length > 1) {
    pokeType = pokemon.types[1].type.name;
    type2.textContent = pokeType;
    type2.setAttribute('data-type', pokeType);
    type2.removeAttribute('hidden');
  } else {
    type2.setAttribute('hidden', true);
    type2.removeAttribute('data-type');
  }
};

// Set up basic pokemon display and kick off move list render.
const updatePokemon = async () => {
  const basicData = document.getElementById('pokemon-basic-data');
  if (!selectedPokemon) {
    basicData.setAttribute('hidden');
    return;
  } else {
    basicData.removeAttribute('hidden');
  }
  const spriteImg = document.getElementById('pokemon-sprite');
  spriteImg.src = selectedPokemon.sprites.front_default;

  getPokemonDisplayName(selectedPokemon.name).then((name) => {
    const nameEl = document.getElementById('pokemon-name');
    nameEl.textContent = name;
  });

  const linkTag = document.getElementById('pokemon-link');
  linkTag.href = `https://pokemondb.net/pokedex/${selectedPokemon.species.name}`;
  
  displayTypes(selectedPokemon);

  renderMoveList(selectedPokemon);
};

let selectedGame = null;
const renderMoveList = async (pokemon) => {
  const listContainer = document.getElementById('pokemon-move-list-container');
  listContainer.innerHTML = '';
  // Break move list into games and separate by move learn method.
  const moves = await getMovesByGen(pokemon.name);

  // render a button for each game
  const buttonContainer = document.getElementById('pokemon-move-list-games');
  buttonContainer.innerHTML = '';
  Object.keys(moves).forEach(async (gen, index) => {
    const button = document.createElement('button');
    button.style.order = index;
    button.textContent = await getGenerationDisplayName(gen);
    button.addEventListener('click', () => {
      document.querySelectorAll('#pokemon-move-list-games button').forEach((b) => {
        b.classList.remove('selected');
      });
      button.classList.add('selected');
      selectedGame = gen;
      setUrlPart('gen', gen);
      clearMoveChanges();
      renderMoveListForGame(gen);
      document.getElementById('add-move-control').removeAttribute('hidden');
    });
    if (selectedGame === gen) {
      button.classList.add('selected');
      renderMoveListForGame(gen);
    }
    buttonContainer.appendChild(button);
  });
};

const renderMoveListForGame = async (gen) => {
  const moves = await getMovesByGen(selectedPokemon.name);
  const genMoves = moves[gen];
  const listContainer = document.getElementById('pokemon-move-list-container');
  listContainer.innerHTML = '';
  Object.keys(genMoves).forEach(async (method) => {
    const methodContainer = document.createElement('div');
    methodContainer.classList.add('pokemon-move-list-method');
    const methodHeader = document.createElement('h3');
    methodHeader.textContent = await getLearnMethodDisplayName(method);
    methodContainer.appendChild(methodHeader);
    
    const moveList = document.createElement('table');
    moveList.classList.add('pokemon-move-list');

    const moveHeader = document.createElement('thead');
    const moveHeaderRow = document.createElement('tr');
    moveHeaderRow.innerHTML = `
      <th class="move-name">Move</th>
      <th>Type</th>
      <th>Cat.</th>
      <th>Power</th>
      <th>Acc.</th>
      <th>PP</th>
    `;
    if (method == 'level-up') {
      moveHeaderRow.innerHTML = '<th>Level</th>' + moveHeaderRow.innerHTML;
    }
    moveHeader.appendChild(moveHeaderRow);
    moveList.appendChild(moveHeader);

    genMoves[method].forEach((move) => {
      renderMove(move.move.name, move.level, move.added, moveList);
    });
    methodContainer.appendChild(moveList);
    listContainer.appendChild(methodContainer);
  });
};

let addedMoves = [];
let removedMoves = [];
const removeMove = (name) => {
  const added = addedMoves.find((move) => {
    return move.move.name === name;
  });
  if (added) {
    addedMoves = addedMoves.filter((move) => move.move.name !== name);
    resetUrlParts();
    return;
  }
  removedMoves.push(name);
  setUrlPart('r', name, true);
};
const addMove = (name, method, level) => {
  addedMoves.push({
    move: {
      name,
    },
    version_group_details: [{
      added: true,
      level_learned_at: level,
      move_learn_method: {
        name: method,
      },
      version_group: {
        name: selectedGame,
      }
    }]
  });
  addMoveToUrl(name, method, level);
};
const addMoveToUrl = (name, method, level) => {
  setUrlPart('a', `${name}|${method}` + (level != undefined ? `|${level}` : ''), true);
};

const clearMoveChanges = () => {
  removedMoves = [];
  addedMoves = [];
  removeUrlPart('r');
  removeUrlPart('a');
};

const renderMove = async (name, level, added, container) => {
  const moveDetail = await getMove(name);
  const row = document.createElement('tr');
  row.classList.add('pokemon-move');

  if (level != null) {
    const moveLevel = document.createElement('td');
    moveLevel.innerText = level;
    row.appendChild(moveLevel);
  }

  const moveName = document.createElement('td');
  moveName.classList.add('move-name');
  moveName.innerText = await getMoveDisplayName(name);
  row.appendChild(moveName);

  const moveTypeCell = document.createElement('td');
  const moveType = document.createElement('div');
  moveType.classList.add('pokemon-type');
  moveTypeCell.appendChild(moveType);
  moveType.setAttribute('data-type', moveDetail.type.name);
  moveType.innerText = moveDetail.type.name;
  row.appendChild(moveTypeCell);

  const moveCategory = document.createElement('td');
  moveCategory.innerText = moveDetail.damage_class.name;
  row.appendChild(moveCategory);

  const movePower = document.createElement('td');
  movePower.innerText = moveDetail.power;
  row.appendChild(movePower);

  const moveAccuracy = document.createElement('td');
  moveAccuracy.innerText = moveDetail.accuracy;
  row.appendChild(moveAccuracy);

  const movePP = document.createElement('td');
  movePP.innerText = moveDetail.pp;
  row.appendChild(movePP);

  const moveAction = document.createElement('td');
  const removeButton = document.createElement('button');
  removeButton.innerText = 'remove';
  if (added) {
    row.classList.add('added');
  } else if (removedMoves.includes(name)) {
    row.classList.add('removed');
    removeButton.setAttribute('disabled', true);
  }
  removeButton.addEventListener('click', () => {
    row.classList.add('removed');
    removeButton.setAttribute('disabled', true);
    removeMove(name);
  });
  moveAction.appendChild(removeButton);
  row.appendChild(moveAction);

  container.appendChild(row);
};

const setupPokemonSuggestions = () => {
  const autocompleteList = document.getElementById('pokemon-list');
  return getPokemonList().then((list) => {
    autocompleteList.innerHTML = '';
    list.forEach((pokemon) => {
      const option = document.createElement('option');
      option.value = pokemon.name;
      option.textContent = pokemon.name;
      autocompleteList.appendChild(option);
    });
    return list;
  });
};

const setupMoveSuggestions = () => {
  const autocompleteList = document.getElementById('move-list');
  return getAllMoves().then((list) => {
    autocompleteList.innerHTML = '';
    list.forEach((move) => {
      const option = document.createElement('option');
      option.value = move.name;
      option.textContent = move.name;
      autocompleteList.appendChild(option);
    });
    return list;
  });
};

// Main

const init = async () => {
  // load from url
  const parsedHash = new URLSearchParams(window.location.hash.substring(1));
  const onLoadPoke = parsedHash.get("poke");
  const onLoadGen = parsedHash.get("gen");
  if (onLoadGen) {
    selectedGame = onLoadGen;
    document.getElementById('add-move-control').removeAttribute('hidden');
    clearMoveChanges();
  }
  const onLoadRemove = parsedHash.getAll("r");
  if (onLoadRemove && onLoadRemove.length) {
    removedMoves = onLoadRemove;
  }
  const onLoadAdd = parsedHash.getAll("a");
  if (onLoadAdd && onLoadAdd.length) {
    addedMoves = onLoadAdd.map((move) => {
      const parts = move.split('|');
      return {
        move: {
          name: parts[0],
        },
        version_group_details: [{
          added: true,
          level_learned_at: parts.length > 2 ? parts[2] : undefined,
          move_learn_method: {
            name: parts[1],
          },
          version_group: {
            name: selectedGame,
          }
        }]
      };
    });
  }
  // pokemon select
  const pokemonInput = document.getElementById('pokemon-name-input');
  pokemonInput.addEventListener('focus', () => {
    setupPokemonSuggestions();
  });
  if (onLoadPoke) {
    pokemonInput.value = onLoadPoke;
    checkName(onLoadPoke);
  } else {
    pokemonInput.value = 'snorlax';
    checkName('snorlax');
  }
  pokemonInput.addEventListener('input', (e) => {
    checkName(e.target.value);
  });
  pokemonInput.removeAttribute('disabled');

  // add move controls
  const moveNameInput = document.getElementById('add-move-name');
  moveNameInput.addEventListener('focus', () => {
    setupMoveSuggestions();
  });
  const learnMethod = document.getElementById('add-move-learn-method');
  const addMoveLevel = document.getElementById('add-move-level');
  learnMethod.addEventListener('change', () => {
    if (learnMethod.value == 'level-up') {
      addMoveLevel.removeAttribute('disabled');
    } else {
      addMoveLevel.setAttribute('disabled', true);
    }
  });
  const addMoveButton = document.getElementById('add-move-button');
  addMoveButton.addEventListener('click', async () => {
    const move = await getMove(moveNameInput.value);
    if (!move) {
      alert(`Could not find move "${moveNameInput.value}"`);
      return;
    }
    let level = undefined;
    if (learnMethod.value == 'level-up') {
      level = addMoveLevel.value;
    }
    addMove(move.name, learnMethod.value, level);
    renderMoveListForGame(selectedGame);
  });

  // footer
  const clearCacheButton = document.getElementById('clear-cache');
  clearCacheButton.addEventListener('click', () => {
    clearDB();
    window.location.reload();
  });

  resetUrlParts();
};
init();
