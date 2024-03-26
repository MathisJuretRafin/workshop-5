import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { Value } from "../types";
import { NodeState } from "../types";

export async function node(
  nodeId: number, // the ID of the node
  N: number, // total number of nodes in the network
  F: number, // number of faulty nodes in the network
  initialValue: Value, // initial value of the node
  isFaulty: boolean, // true if the node is faulty, false otherwise
  nodesAreReady: () => boolean, // used to know if all nodes are ready to receive requests
  setNodeIsReady: (index: number) => void // this should be called when the node is started and ready to receive requests
) {
  const node = express();
  node.use(express.json());
  node.use(bodyParser.json());
  let state: NodeState = {
    killed: false,
    x: initialValue, // initial consensus value
    decided: null,
    k: null
  };
  
  let msgP1: Map<number, Value[]> = new Map();
  let msgP2: Map<number, Value[]> = new Map();

  
  node.get('/status', (req, res) => {
    if (isFaulty) {
      res.status(500).send('faulty');
    } else {
      res.status(200).send('live');
    }
  });

  node.post("/message", (req, res) => {
    let { k, x, phase } = req.body;
    if (!isFaulty && !state.killed) {
      if (phase == "propose") {
        if (!msgP1.has(k)) {
          msgP1.set(k, []);
        }
        msgP1.get(k)!.push(x);

        if (msgP1.get(k)!.length >= (N - F)) {
          let count0 = msgP1.get(k)!.filter((el) => el == 0).length;
          let count1 = msgP1.get(k)!.filter((el) => el == 1).length;
          if (2 * count0 > N) {
            state.x = 0;
          } else if (2 * count1 > N) {
            state.x = 1;
          } else {
            state.x = "?";
          }
          for (let i = 0; i < N; i++) {
            fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ k: k, x: x, phase: 2 }),
            });
          }
        }
      }
      else if (phase == 2 && !state.killed) {
        if (!msgP2.has(k)) {
          msgP2.set(k, []);
        }
        msgP2.get(k)!.push(x);
        if (msgP2.get(k)!.length >= (N - F)) {
          let count0 = msgP2.get(k)!.filter((el) => el == 0).length;
          let count1 = msgP2.get(k)!.filter((el) => el == 1).length;
          if (count0 >= F + 1) {
            state.x = 0;
            state.decided = true;
          } else if (count1 >= F + 1) {
            state.x = 1;
            state.decided = true;
          } else {
            if (count0 + count1 > 0 && count0 > count1) {
              state.x = 0;
            }
            else if (count0 + count1 > 0 && count0 < count1) {
              state.x = 1;
            }
            else {
              state.x = Math.random() < 0.5 ? 0 : 1;
            }
            state.k = k + 1;
            for (let i = 0; i < N; i++) {
              fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ k: state.k, x: state.x, phase: "propose" }),
              });
            }
          }
        }
      }
    }
    res.status(200).send("Message received and processed.");
  });

  node.get("/start", async (req, res) => {
    if (!isFaulty) {
      state.k = 1;
      state.x = initialValue;
      state.decided = false;
      for (let i = 0; i < N; i++) {
        fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ k: state.k, x: state.x, phase: "propose" }),
        });
      }
    }
    else {
      state.decided = null;
      state.x = null;
      state.k = null;
    }
    res.status(200).send("Consensus algorithm started.");
  });

  node.get("/stop", async (req, res) => {
    state.killed = true;
    res.status(200).send("killed");
  });

  node.get('/getState', (req, res) => {
    res.status(200).send(state);
  });

  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(
      `Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`
    );
    setNodeIsReady(nodeId);
  });

  return server;
}
