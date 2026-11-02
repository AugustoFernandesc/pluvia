local cjson = require "cjson.safe"
local sha256 = require "kong.tools.sha256"

local RATE_LIMIT_HEADER = "X-Pluvia-RateLimit-Subject"

local PluviaSubjectRateLimitHandler = {
  VERSION = "1.0.0",
  -- JWT (1450) authenticates first; rate-limiting (910) consumes the value next.
  PRIORITY = 1000,
}

local function subject_from_verified_token()
  local token = kong.ctx.shared.authenticated_jwt_token
  if type(token) ~= "string" then
    return nil, "JWT plugin did not provide an authenticated token"
  end

  local payload = token:match("^[^.]+%.([^.]+)%.[^.]+$")
  if not payload then
    return nil, "authenticated token has an invalid compact format"
  end

  payload = payload:gsub("-", "+"):gsub("_", "/")
  payload = payload .. string.rep("=", (4 - #payload % 4) % 4)
  local decoded = ngx.decode_base64(payload)
  if not decoded then
    return nil, "authenticated token payload could not be decoded"
  end

  local claims = cjson.decode(decoded)
  if type(claims) ~= "table" or type(claims.sub) ~= "string" or claims.sub == "" then
    return nil, "authenticated token has no usable subject"
  end

  return claims.sub
end

function PluviaSubjectRateLimitHandler:access(_conf)
  local subject, err = subject_from_verified_token()
  if not subject then
    kong.log.err("[pluvia-subject-rate-limit] ", err)
    return kong.response.exit(401, { message = "Unauthorized" })
  end

  local subject_hash, hash_error = sha256.sha256_hex(subject)
  if not subject_hash then
    kong.log.err("[pluvia-subject-rate-limit] unable to hash authenticated subject: ", hash_error)
    return kong.response.exit(500, { message = "Rate limit identity unavailable" })
  end

  -- Replace any client-supplied value only after JWT verification succeeded.
  local ok, set_error = ngx.req.set_header(RATE_LIMIT_HEADER, subject_hash)
  if not ok then
    kong.log.err("[pluvia-subject-rate-limit] unable to set internal rate limit header: ", set_error)
    return kong.response.exit(500, { message = "Rate limit identity unavailable" })
  end
end

return PluviaSubjectRateLimitHandler
