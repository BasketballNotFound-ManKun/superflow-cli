import java.io.InputStream;
import java.io.PrintWriter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.Statement;
import java.util.List;
import java.util.Map;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.session.SqlSessionFactoryBuilder;
import org.apache.ibatis.datasource.pooled.PooledDataSource;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;

/** Anonymous production-shaped XML chain; no business data or credentials. */
public class MapperReplay {
    interface CompletionMapper {
        int complete(Map<String, Object> request);
    }

    static class CompletionService {
        private final CompletionMapper mapper;

        CompletionService(CompletionMapper mapper) {
            this.mapper = mapper;
        }

        int complete() {
            return mapper.complete(Map.of("businessId", "target", "round", 2,
                    "state", 2, "token", "new-token"));
        }
    }

    public static void main(String[] args) throws Exception {
        if ("mock".equals(args[0])) {
            mockSignal();
            return;
        }
        PooledDataSource source = new PooledDataSource(
                "com.mysql.cj.jdbc.Driver", System.getenv("REPLAY_JDBC_URL"),
                "root", "");
        try {
            prepareSchema(source, Path.of(args[2]));
            replay(source, Path.of(args[1]));
        } finally {
            source.forceCloseAll();
        }
    }

    private static void mockSignal() {
        CompletionMapper mock = request -> {
            if (!"new-token".equals(request.get("token"))) {
                throw new AssertionError("Service request lost token");
            }
            return 1;
        };
        if (new CompletionService(mock).complete() != 1) {
            throw new AssertionError("Mock completion failed");
        }
        try (PrintWriter output = new PrintWriter(System.out)) {
            output.println("{\"layer\":\"logic\",\"status\":\"PASS\"}");
        }
    }

    private static void prepareSchema(PooledDataSource source, Path schema)
            throws Exception {
        try (Connection connection = source.getConnection();
                Statement statement = connection.createStatement()) {
            statement.execute("DROP TABLE IF EXISTS attempt_record");
            for (String sql : Files.readString(schema).split(";")) {
                if (!sql.isBlank()) {
                    statement.execute(sql);
                }
            }
        }
    }

    private static void replay(PooledDataSource source, Path xml)
            throws Exception {
        Configuration config = new Configuration(new Environment("replay",
                new JdbcTransactionFactory(), source));
        try (InputStream input = Files.newInputStream(xml)) {
            new XMLMapperBuilder(input, config, xml.toString(),
                    config.getSqlFragments()).parse();
        }
        try (SqlSession session = new SqlSessionFactoryBuilder()
                .build(config).openSession()) {
            List<Map<String, Object>> before = session
                    .selectList("AttemptMapper.read");
            CompletionService service = new CompletionService(request ->
                    session.update("AttemptMapper.complete", request));
            int affected = service.complete();
            session.commit();
            List<Map<String, Object>> after = session
                    .selectList("AttemptMapper.read");
            recordSignal(session, before, after, affected);
        }
    }

    private static void recordSignal(SqlSession session,
            List<Map<String, Object>> before,
            List<Map<String, Object>> after, int affected) throws Exception {
        Object token = after.get(2).get("verification_token");
        boolean unchanged = before.get(0).equals(after.get(0))
                && before.get(1).equals(after.get(1));
        String version = session.getConnection().getMetaData()
                .getDatabaseProductVersion();
        boolean passed = affected == 1 && unchanged
                && Integer.valueOf(2).equals(after.get(2).get("state"))
                && "new-token".equals(token);
        try (PrintWriter output = new PrintWriter(System.out)) {
            output.printf("{\"engine\":\"mysql\",\"version\":\"%s\","
                    + "\"statement\":\"AttemptMapper.complete\","
                    + "\"affectedRows\":%d,\"unchangedRows\":{"
                    + "\"before\":%s,\"after\":%s},"
                    + "\"businessId\":\"target\",\"round\":2,"
                    + "\"before\":null,\"after\":%s,\"status\":\"%s\"}%n",
                    version, affected, isolationSnapshot(before),
                    isolationSnapshot(after),
                    token == null ? "null" : "\"" + token + "\"",
                    passed ? "PASS" : "FAIL");
        }
        if (!passed) {
            throw new AssertionError("Frozen token/state/isolation mismatch");
        }
    }

    private static String isolationSnapshot(List<Map<String, Object>> rows) {
        return "{\"other:2\":" + rowSnapshot(rows.get(0))
                + ",\"target:1\":" + rowSnapshot(rows.get(1)) + "}";
    }

    private static String rowSnapshot(Map<String, Object> row) {
        return String.format("{\"businessId\":\"%s\",\"round\":%s,"
                + "\"state\":%s,\"verificationToken\":\"%s\"}",
                row.get("business_id"), row.get("round_number"),
                row.get("state"), row.get("verification_token"));
    }

}
