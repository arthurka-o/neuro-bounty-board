// src/twitch_sub.plugin.ts
var host = "gql.twitch.tv";
var config = {
  name: "Twitch Sub Prover",
  description: "Prove you are subscribed to a Twitch channel.",
  requests: [
    {
      method: "POST",
      host,
      pathname: "/gql",
      verifierUrl: "https://notary.reyvon.gay"
    }
  ],
  urls: ["https://www.twitch.tv/*"]
};
var generateProof = async (channelName) => {
  const cachedAuthorization = useState("authorization", null);
  const cachedClientId = useState("client-id", null);
  if (!cachedAuthorization || !cachedClientId) return;
  const body = JSON.stringify({
    query: `query { currentUser { id } user(login: "${channelName}") { displayName self { subscriptionBenefit { tier purchasedWithPrime } } } }`
  });
  const headers = {
    "content-type": "text/plain;charset=UTF-8",
    authorization: cachedAuthorization,
    "client-id": cachedClientId,
    Host: host,
    "Accept-Encoding": "identity",
    Connection: "close"
  };
  const resp = await prove(
    {
      url: `https://${host}/gql`,
      method: "POST",
      headers,
      body
    },
    {
      verifierUrl: "https://notary.reyvon.gay",
      proxyUrl: "wss://notary.reyvon.gay/proxy?token=" + host,
      maxRecvData: 4096,
      maxSentData: 4096,
      handlers: [
        // REVEAL request line — proves we hit gql.twitch.tv/gql
        { type: "SENT", part: "START_LINE", action: "REVEAL" },
        // REVEAL request body — proves which channel we queried
        { type: "SENT", part: "BODY", action: "REVEAL" },
        // REVEAL response status — HTTP 200 OK
        { type: "RECV", part: "START_LINE", action: "REVEAL" },
        // REVEAL date header — proves when the proof was generated
        {
          type: "RECV",
          part: "HEADERS",
          action: "REVEAL",
          params: { key: "date" }
        },
        // REVEAL entire response body — it's only ~200 bytes with the custom query,
        // containing just displayName, tier, and purchasedWithPrime
        { type: "RECV", part: "BODY", action: "REVEAL" }
        // Auth headers (Authorization, Client-ID) stay COMMITTED but NOT revealed
      ]
    }
  );
  doneWithOverlay(JSON.stringify(resp));
};
var proveVedal987 = async () => {
  const isRequestPending = useState("isRequestPending", false);
  if (isRequestPending) return;
  setState("isRequestPending", true);
  setState("selectedChannel", "vedal987");
  await generateProof("vedal987");
};
var retryDetection = async () => {
  setState("authorization", null);
  setState("client-id", null);
};
var expandUI = () => {
  setState("isMinimized", false);
};
var minimizeUI = () => {
  setState("isMinimized", true);
};
var proveProgressBar = () => {
  const progress = useState("_proveProgress", null);
  if (!progress) return [];
  const pct = `${Math.round(progress.progress * 100)}%`;
  return [
    div({ style: { marginTop: "12px" } }, [
      div(
        {
          style: {
            height: "6px",
            backgroundColor: "#e5e7eb",
            borderRadius: "3px",
            overflow: "hidden"
          }
        },
        [
          div(
            {
              style: {
                height: "100%",
                width: pct,
                background: "linear-gradient(90deg, #9146FF, #772CE8)",
                borderRadius: "3px",
                transition: "width 0.4s ease"
              }
            },
            []
          )
        ]
      ),
      div(
        {
          style: {
            fontSize: "12px",
            color: "#6b7280",
            marginTop: "6px",
            textAlign: "center"
          }
        },
        [progress.message]
      )
    ])
  ];
};
var channelButton = (label, callback, isRequestPending) => {
  return button(
    {
      style: {
        width: "100%",
        padding: "10px 16px",
        borderRadius: "6px",
        border: "none",
        background: "linear-gradient(135deg, #9146FF 0%, #772CE8 100%)",
        color: "white",
        fontWeight: "600",
        fontSize: "14px",
        transition: "all 0.2s ease",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        opacity: isRequestPending ? "0.5" : "1",
        cursor: isRequestPending ? "not-allowed" : "pointer",
        marginBottom: "8px"
      },
      onclick: callback
    },
    [isRequestPending ? "Generating Proof..." : `Prove sub to ${label}`]
  );
};
var main = () => {
  const isMinimized = useState("isMinimized", false);
  const isRequestPending = useState("isRequestPending", false);
  const cachedAuthorization = useState("authorization", null);
  const cachedClientId = useState("client-id", null);
  const needsAuth = !cachedAuthorization || !cachedClientId;
  const gqlHeaders = useHeaders(
    (h) => needsAuth ? h.filter((x) => x.url.includes("gql.twitch.tv")) : []
  );
  let isConnected = !!(cachedAuthorization && cachedClientId);
  if (needsAuth && gqlHeaders.length > 0) {
    const header = gqlHeaders[0];
    const authorization = header.requestHeaders.find(
      (h) => h.name.toLowerCase() === "authorization"
    )?.value;
    const clientId = header.requestHeaders.find(
      (h) => h.name.toLowerCase() === "client-id"
    )?.value;
    if (authorization && !cachedAuthorization) setState("authorization", authorization);
    if (clientId && !cachedClientId) setState("client-id", clientId);
    isConnected = !!((authorization || cachedAuthorization) && (clientId || cachedClientId));
  }
  useEffect(() => {
    openWindow("https://www.twitch.tv/vedal987");
  }, []);
  if (isMinimized) {
    return div(
      {
        style: {
          position: "fixed",
          bottom: "20px",
          right: "20px",
          width: "60px",
          height: "60px",
          borderRadius: "50%",
          backgroundColor: "#9146FF",
          boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
          zIndex: "999999",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          transition: "all 0.3s ease",
          fontSize: "24px",
          color: "white"
        },
        onclick: "expandUI"
      },
      ["TV"]
    );
  }
  return div(
    {
      style: {
        position: "fixed",
        bottom: "0",
        right: "8px",
        width: "280px",
        borderRadius: "8px 8px 0 0",
        backgroundColor: "white",
        boxShadow: "0 -2px 10px rgba(0,0,0,0.1)",
        zIndex: "999999",
        fontSize: "14px",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        overflow: "hidden"
      }
    },
    [
      div(
        {
          style: {
            background: "linear-gradient(135deg, #9146FF 0%, #772CE8 100%)",
            padding: "12px 16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "white"
          }
        },
        [
          div({ style: { fontWeight: "600", fontSize: "16px" } }, ["Twitch Sub Prover"]),
          button(
            {
              style: {
                background: "transparent",
                border: "none",
                color: "white",
                fontSize: "20px",
                cursor: "pointer",
                padding: "0",
                width: "24px",
                height: "24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              },
              onclick: "minimizeUI"
            },
            ["\u2212"]
          )
        ]
      ),
      div({ style: { padding: "20px", backgroundColor: "#f8f9fa" } }, [
        div(
          {
            style: {
              marginBottom: "16px",
              padding: "12px",
              borderRadius: "6px",
              backgroundColor: isConnected ? "#d4edda" : "#f8d7da",
              color: isConnected ? "#155724" : "#721c24",
              border: `1px solid ${isConnected ? "#c3e6cb" : "#f5c6cb"}`,
              fontWeight: "500"
            }
          },
          [isConnected ? "\u2713 Twitch session detected" : "\u26A0 Waiting for Twitch login..."]
        ),
        isConnected ? div({}, [
          div(
            {
              style: {
                marginBottom: "12px",
                fontSize: "13px",
                color: "#374151",
                fontWeight: "500"
              }
            },
            ["Select channel to prove subscription:"]
          ),
          channelButton("vedal987", "proveVedal987", isRequestPending)
        ]) : div(
          {
            style: {
              textAlign: "center",
              color: "#666",
              padding: "12px",
              backgroundColor: "#fff3cd",
              borderRadius: "6px",
              border: "1px solid #ffeaa7"
            }
          },
          ["Please login to Twitch, or click Retry if already logged in."]
        ),
        !isConnected ? button(
          {
            style: {
              width: "100%",
              marginTop: "8px",
              padding: "8px 16px",
              borderRadius: "6px",
              border: "1px solid #9146FF",
              background: "transparent",
              color: "#9146FF",
              fontWeight: "600",
              fontSize: "13px",
              cursor: "pointer"
            },
            onclick: "retryDetection"
          },
          ["Retry Detection"]
        ) : div({}, []),
        ...proveProgressBar()
      ])
    ]
  );
};
var twitch_sub_plugin_default = {
  main,
  proveVedal987,
  retryDetection,
  expandUI,
  minimizeUI,
  config
};
export {
  twitch_sub_plugin_default as default
};
