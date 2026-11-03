package org.example.camerastream.modules.license;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class LicenseFilterTest {

    private static final LicenseResult VALID =
            new LicenseResult(true, LicenseStatus.VALID, "ok", "KH", "PX-X", Instant.now().plusSeconds(1000), false, 10);
    private static final LicenseResult EXPIRED = LicenseResult.fail(LicenseStatus.EXPIRED, "het han");

    private MockHttpServletResponse run(LicenseService svc, String method, String uri) throws Exception {
        LicenseFilter f = new LicenseFilter(svc);
        MockHttpServletRequest req = new MockHttpServletRequest(method, uri);
        MockHttpServletResponse res = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);
        f.doFilter(req, res, chain);
        lastChainCalled = mockingDetails(chain).getInvocations().size() > 0;
        return res;
    }

    private boolean lastChainCalled;

    private LicenseService svc(boolean enforced, LicenseResult r) {
        LicenseService s = mock(LicenseService.class);
        when(s.isEnforced()).thenReturn(enforced);
        when(s.current()).thenReturn(r);
        return s;
    }

    @Test
    void blocksApiWhenEnforcedAndInvalid() throws Exception {
        MockHttpServletResponse res = run(svc(true, EXPIRED), "GET", "/api/cameras");
        assertEquals(403, res.getStatus());
        assertFalse(lastChainCalled);
        assertTrue(res.getContentAsString().contains("LICENSE_INVALID"));
    }

    @Test
    void allowsApiWhenValid() throws Exception {
        MockHttpServletResponse res = run(svc(true, VALID), "GET", "/api/cameras");
        assertEquals(200, res.getStatus());
        assertTrue(lastChainCalled);
    }

    @Test
    void licenseEndpointsAlwaysReachable() throws Exception {
        run(svc(true, EXPIRED), "GET", "/api/license/status");
        assertTrue(lastChainCalled);
        run(svc(true, EXPIRED), "POST", "/api/license/activate");
        assertTrue(lastChainCalled);
    }

    @Test
    void notEnforcedPassesEverything() throws Exception {
        run(svc(false, EXPIRED), "GET", "/api/cameras");
        assertTrue(lastChainCalled);
    }

    @Test
    void nonApiAndPreflightPass() throws Exception {
        run(svc(true, EXPIRED), "GET", "/snapshots/a.jpg");
        assertTrue(lastChainCalled);
        run(svc(true, EXPIRED), "OPTIONS", "/api/cameras");
        assertTrue(lastChainCalled);
    }
}
