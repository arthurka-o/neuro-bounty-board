import { gql, GraphQLClient } from "graphql-request";

const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL ??
  "https://api.goldsky.com/api/public/project_cmnoje7b9buvl01xj3a1jhej4/subgraphs/neuro-bounty-board/1.0.0/gn";

const client = new GraphQLClient(SUBGRAPH_URL);

// ─── Types ──────────────────────────────────────────────────────────

export type SubgraphBounty = {
  id: string;
  sponsor: string;
  dev: string | null;
  reward: string;
  bond: string | null;
  deadline: string;
  bondStakeDeadline: string | null;
  submissionTime: string | null;
  proofURI: string | null;
  status: string;
  createdAt: string;
  createdTx: string;
  dispute: {
    id: string;
    votingEnd: string;
    approveCount: number;
    rejectCount: number;
    status: string;
    extended: boolean;
  } | null;
};

// ─── Queries ────────────────────────────────────────────────────────

const BOUNTIES_QUERY = gql`
  query Bounties($first: Int!, $skip: Int!, $orderBy: String!) {
    bounties(
      first: $first
      skip: $skip
      orderBy: $orderBy
      orderDirection: desc
    ) {
      id
      sponsor
      dev
      reward
      bond
      deadline
      bondStakeDeadline
      submissionTime
      proofURI
      status
      createdAt
      createdTx
      dispute {
        id
        votingEnd
        approveCount
        rejectCount
        status
        extended
      }
    }
  }
`;

const BOUNTY_QUERY = gql`
  query Bounty($id: ID!) {
    bounty(id: $id) {
      id
      sponsor
      dev
      reward
      bond
      deadline
      bondStakeDeadline
      submissionTime
      proofURI
      status
      createdAt
      createdTx
      dispute {
        id
        votingEnd
        approveCount
        rejectCount
        status
        extended
      }
    }
  }
`;

// ─── Fetch functions ────────────────────────────────────────────────

export async function fetchBounties(
  first = 100,
  skip = 0,
  orderBy = "createdAt"
): Promise<SubgraphBounty[]> {
  const data = await client.request<{ bounties: SubgraphBounty[] }>(
    BOUNTIES_QUERY,
    { first, skip, orderBy }
  );
  return data.bounties;
}

export async function fetchBounty(
  id: number
): Promise<SubgraphBounty | null> {
  const data = await client.request<{ bounty: SubgraphBounty | null }>(
    BOUNTY_QUERY,
    { id: id.toString() }
  );
  return data.bounty;
}
