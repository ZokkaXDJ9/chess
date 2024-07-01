import firebaseConfig from "./firebaseConfig.js";

$(document).ready(function () {
  firebase.initializeApp(firebaseConfig);

  const statusElement = $("#status");
  const fenElement = $("#fen");
  const pgnBody = $("#pgnBody");

  const game = new Chess();
  let viewingHistory = false;
  let currentPosition = "start";
  let gameId = null;

  const db = firebase.firestore();

  function initializeGame() {
    gameId = generateGameId();
    if (!gameId) {
      // Create a new game entry in Firestore
      const newGameRef = db.collection("games").doc();
      gameId = newGameRef.id;
      newGameRef.set({
        fen: game.fen(),
        pgn: game.pgn(),
      });

      // Update the URL with the new game ID
      window.history.replaceState(null, null, `?game=${gameId}`);
    }

    // Listen for changes in the game state
    db.collection("games")
      .doc(gameId)
      .onSnapshot((doc) => {
        const gameData = doc.data();
        if (gameData) {
          game.load(gameData.fen);
          updateBoard();
          updatePgnTable();
        }
      });
  }

  function generateGameId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("game");
  }

  const boardConfig = {
    draggable: true,
    position: currentPosition,
    onDragStart: onDragStart,
    onDrop: onDrop,
    onMouseoutSquare: onMouseoutSquare,
    onMouseoverSquare: onMouseoverSquare,
    onSnapEnd: onSnapEnd,
  };

  const board = Chessboard("board", boardConfig);

  function onMouseoverSquare(square, piece) {
    if (viewingHistory) return;

    const moves = game.moves({
      square: square,
      verbose: true,
    });

    if (moves.length === 0) return;

    greySquare(square);

    for (const move of moves) {
      greySquare(move.to);
    }
  }

  function onMouseoutSquare(square, piece) {
    if (viewingHistory) return;

    removeGreySquares();
  }

  function onDragStart(source, piece, position, orientation) {
    if (viewingHistory) return false;

    // do not pick up pieces if the game is over
    if (game.in_checkmate() === true || game.in_draw() === true) {
      return false;
    }

    // only pick up pieces for the side to move
    if (
      (game.turn() === "w" && piece.search(/^b/) !== -1) ||
      (game.turn() === "b" && piece.search(/^w/) !== -1)
    ) {
      return false;
    }
  }

  function onDrop(source, target) {
    if (viewingHistory) return "snapback";

    removeGreySquares();

    // see if the move is legal
    const move = game.move({
      from: source,
      to: target,
      promotion: "q", // NOTE: always promote to a queen for simplicity
    });

    // illegal move
    if (move === null) return "snapback";

    currentPosition = game.fen();
    updateStatus();
    updatePgnTable();

    // Update the game state in Firestore
    db.collection("games").doc(gameId).set({
      fen: game.fen(),
      pgn: game.pgn(),
    });
  }

  function onSnapEnd() {
    if (viewingHistory) return;

    board.position(game.fen());
  }

  function removeGreySquares() {
    $("#board .square-55d63").css("background", "");
  }

  function greySquare(square) {
    const squareEl = $("#board .square-" + square);
    const background = "#a9a9a9";
    if (squareEl.hasClass("black-3c85d") === true) {
      squareEl.css("background", background);
    } else {
      squareEl.css("background", background);
    }
  }

  function updateStatus() {
    let status = "";

    const moveColor = game.turn() === "b" ? "Black" : "White";

    if (game.in_checkmate() === true) {
      status = `Game over, ${moveColor} is in checkmate.`;
    } else if (game.in_draw() === true) {
      status = "Game over, drawn position";
    } else {
      status = `${moveColor} to move`;

      if (game.in_check() === true) {
        status += `, ${moveColor} is in check`;
      }
    }

    statusElement.html(status);
    fenElement.html(`FEN: ${game.fen()}`);
  }

  function updatePgnTable() {
    pgnBody.empty();
    const history = game.history({ verbose: true });
    let moveNumber = 1;
    for (let i = 0; i < history.length; i += 2) {
      const whiteMove = history[i] ? history[i].san : "";
      const blackMove = history[i + 1] ? history[i + 1].san : "";
      const row = `<tr>
                            <td>${moveNumber}</td>
                            <td class="move" data-index="${i}">${whiteMove}</td>
                            <td class="move" data-index="${
                              i + 1
                            }">${blackMove}</td>
                         </tr>`;
      pgnBody.append(row);
      moveNumber++;
    }

    // Add click event listener for each move in PGN table
    $(".move").click(function () {
      const moveIndex = $(this).data("index");
      const history = game.history({ verbose: true });

      // Create a new game instance and apply moves up to the selected move
      const tempGame = new Chess();
      for (let i = 0; i <= moveIndex; i++) {
        tempGame.move(history[i].san);
      }

      board.position(tempGame.fen());
      viewingHistory = moveIndex < history.length - 1;

      // Update draggable option based on whether viewing history or not
      boardConfig.draggable = !viewingHistory;
      board.draggable = !viewingHistory;
    });
  }

  function updateBoard() {
    board.position(game.fen());
  }

  updateStatus();
  updatePgnTable();
  initializeGame();
});
